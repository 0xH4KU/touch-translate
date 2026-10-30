  function captionWait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      const finish = () => { signal.removeEventListener("abort", abort); resolve(); };
      const abort = () => { clearTimeout(timer); reject(cancelledError()); };
      const timer = setTimeout(finish, milliseconds);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  }

  async function loadYoutubeCaptions(session) {
    const signal = session.controller.signal;
    const attempted = new Map();
    let lastUrl = "";
    let requestedCaptions = false;
    let lastFailure = "";
    for (let attempt = 0; attempt < 40; attempt++) {
      if (signal.aborted || youtubeVideoId() !== session.videoId) throw cancelledError();
      const snapshot = await captionBridgeRequest("snapshot", {}, signal);
      if (snapshot?.videoId === session.videoId) {
        if (snapshot.live) throw new Error("Live captions are not supported yet. Use a regular YouTube video.");
        const track = selectYoutubeTrack(snapshot);
        if (!track) throw new Error("This video has no available captions. Speech transcription is not included.");
        if (typeof track.languageCode !== "string" || track.languageCode.length > 64 || !["", "asr"].includes(track.kind || "")) throw new Error("Invalid YouTube caption track.");
        const url = youtubeCaptionUrl(track, snapshot);
        if ((attempted.get(url) || 0) < 3 && (url !== lastUrl || attempt % 10 === 0)) {
          attempted.set(url, (attempted.get(url) || 0) + 1);
          lastUrl = url;
          let text = "";
          try { text = await captionBridgeRequest("load", { url }, signal); }
          catch (error) {
            if (!/YouTube captions: HTTP 403\./.test(error.message)) throw error;
            lastFailure = error.message;
          }
          if (typeof text === "string" && text.trim()) {
            session.trackKey = youtubeTrackKey(track);
            return makeSubtitleChunks(parseYoutubeCaptions(text, track.kind === "asr"), track.kind === "asr");
          }
        }
        if (!requestedCaptions) {
          requestedCaptions = true;
          await captionBridgeRequest("enable", {
            videoId: session.videoId, languageCode: track.languageCode, kind: track.kind || "",
          }, signal);
        }
      }
      setSubtitleStatus("Waiting for captions. Start playback and turn on YouTube CC.");
      await captionWait(300, signal);
    }
    throw new Error(`${lastFailure || "YouTube returned empty captions."} Start playback, turn on CC, then press Retry.`);
  }

  function subtitleQueueChunk(session) {
    const time = session.video.currentTime * 1000;
    const lookahead = SUBTITLE_LOOKAHEAD_MS * Math.min(4, Math.max(1, session.video.playbackRate || 1));
    return session.chunks.find((chunk) => !chunk.done && !chunk.failed && chunk.end > time && chunk.start <= time + lookahead);
  }

  function cancelSubtitleRequest(session) {
    if (!session) return;
    session.generation++;
    session.request?.abort();
    session.request = null;
  }

  async function pumpSubtitleQueue(session) {
    if (session !== subtitleSession || session.running || session.error || session.controller.signal.aborted ||
      session.player.classList.contains("ad-showing") || session.player.classList.contains("ad-interrupting")) return;
    const chunk = subtitleQueueChunk(session);
    if (!chunk) return;
    session.running = true;
    const generation = session.generation;
    const current = () => session === subtitleSession && generation === session.generation && !session.controller.signal.aborted;
    try {
      const key = subtitleCacheKey(chunk, session.settings, session.preferences.smart);
      const cached = loadCache()[key];
      let groups;
      if (cached?.groups) {
        try { groups = parseSubtitleGroups(cached, chunk, session.preferences.smart); } catch { /* Ignore corrupt or outdated local cache entries. */ }
      }
      if (!groups) {
        session.request = requestSubtitleTranslation(chunk, session.settings, session.preferences.smart);
        try { groups = await session.request.promise; }
        catch (error) {
          if (!current()) return;
          if (error.code !== "SUBTITLE_SEGMENTATION_ERROR" || !session.preferences.smart || !chunk.automatic) throw error;
          setSubtitleStatus("Smart segmentation was invalid; using basic boundaries.");
          session.request = requestSubtitleTranslation(chunk, session.settings, false);
          groups = await session.request.promise;
        }
        if (!current()) return;
        saveCache({ [key]: { at: Date.now(), groups: groups.map(({ from, to, translation }) => ({ from, to, translation })) } });
      }
      if (!current()) return;
      chunk.groups = groups;
      chunk.done = true;
      updateNativeSubtitles(session, chunk);
      renderSubtitles(session);
      setSubtitleStatus("");
    } catch (error) {
      if (current() && error.name !== "AbortError") {
        chunk.failed = true;
        session.error = error;
        setSubtitleStatus(redactProviderDiagnostic(errorMessageFor(error), session.settings.apiKey), true);
      }
    } finally {
      session.request = null;
      session.running = false;
      if (session === subtitleSession && !session.error) void pumpSubtitleQueue(session);
    }
  }

  function stopYoutubeSubtitles(message = "") {
    subtitleIntent++;
    const session = subtitleSession;
    subtitleSession = null;
    if (session) {
      session.controller.abort();
      cancelSubtitleRequest(session);
      for (const [type, handler] of session.listeners) session.video.removeEventListener(type, handler);
      leaveNativeSubtitles(session);
      session.player.classList.remove(`${SCRIPT_PREFIX}__active`);
      void captionBridgeRequest("restore", { videoId: session.videoId }).catch(() => {});
    }
    if (subtitleView) {
      subtitleView.toggle.textContent = "Translate CC";
      subtitleView.toggle.setAttribute("aria-pressed", "false");
      subtitleView.captions.hidden = true;
      subtitleView.source.textContent = subtitleView.translation.textContent = "";
      setSubtitleStatus(message);
    }
  }

  async function startYoutubeSubtitles() {
    const view = subtitleView;
    if (!view || !youtubeVideoId()) return;
    stopYoutubeSubtitles();
    const intent = subtitleIntent;
    view.toggle.textContent = "Cancel";
    view.toggle.setAttribute("aria-pressed", "true");
    try {
      const settings = await readySettings();
      if (intent !== subtitleIntent || view !== subtitleView) return;
      if (!settings) { stopYoutubeSubtitles(); return; }
      const session = {
        videoId: youtubeVideoId(), player: view.player, video: view.video, settings,
        preferences: { ...view.preferences }, controller: new AbortController(),
        chunks: [], listeners: [], generation: 0, running: false, request: null, error: null,
      };
      subtitleSession = session;
      setSubtitleStatus("Loading YouTube captions…");
      session.chunks = await loadYoutubeCaptions(session);
      if (session !== subtitleSession || session.controller.signal.aborted) return;
      const listen = (type, handler) => {
        session.listeners.push([type, handler]);
        session.video.addEventListener(type, handler);
      };
      listen("seeking", () => { cancelSubtitleRequest(session); renderSubtitles(session); void pumpSubtitleQueue(session); });
      listen("timeupdate", () => { renderSubtitles(session); void pumpSubtitleQueue(session); });
      listen("ratechange", () => { void pumpSubtitleQueue(session); });
      listen("webkitbeginfullscreen", () => { enterNativeSubtitles(session); renderSubtitles(session); });
      listen("webkitendfullscreen", () => { leaveNativeSubtitles(session); renderSubtitles(session); });
      session.player.classList.add(`${SCRIPT_PREFIX}__active`);
      view.toggle.textContent = "Stop CC";
      if (session.video.webkitDisplayingFullscreen) enterNativeSubtitles(session);
      renderSubtitles(session);
      setSubtitleStatus("Translating nearby captions…");
      void pumpSubtitleQueue(session);
    } catch (error) {
      if (intent !== subtitleIntent) return;
      stopYoutubeSubtitles();
      if (error.name !== "AbortError") setSubtitleStatus(errorMessageFor(error), true);
    }
  }

  function toggleYoutubeSubtitles() {
    if (subtitleView?.toggle.getAttribute("aria-pressed") === "true") stopYoutubeSubtitles();
    else void startYoutubeSubtitles();
  }

  function restartYoutubeSubtitles() {
    stopYoutubeSubtitles();
    void startYoutubeSubtitles();
  }

  function retryYoutubeSubtitles() {
    if (!subtitleSession?.chunks.length) { void startYoutubeSubtitles(); return; }
    subtitleSession.error = null;
    subtitleSession.chunks.forEach((chunk) => { chunk.failed = false; });
    setSubtitleStatus("Retrying captions…");
    void pumpSubtitleQueue(subtitleSession);
  }

  async function checkSubtitleTrack(session) {
    if (session.checking || !session.trackKey || session !== subtitleSession) return;
    session.checking = true;
    try {
      const snapshot = await captionBridgeRequest("snapshot", {}, session.controller.signal);
      if (session !== subtitleSession || snapshot?.videoId !== session.videoId) return;
      if (youtubeTrackKey(selectYoutubeTrack(snapshot)) !== session.trackKey) restartYoutubeSubtitles();
    } catch { /* Playback can briefly replace the player during ads and navigation. */ }
    finally { session.checking = false; }
  }
