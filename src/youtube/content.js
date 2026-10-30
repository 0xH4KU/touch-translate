  function youtubeVideoId(url = location.href) {
    try {
      const parsed = new URL(url);
      const id = parsed.searchParams.get("v");
      return parsed.pathname === "/watch" && /^[\w-]{11}$/.test(id || "") ? id : null;
    } catch { return null; }
  }

  function normalizeLanguageTag(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(?:zh[-_](?:tw|hk|mo|hant)|traditional\s+chinese|繁體|正體)/i.test(raw)) return "zh-hant";
    if (/^(?:zh[-_](?:cn|sg|hans)|simplified\s+chinese|简体|簡體)/i.test(raw)) return "zh-hans";
    if (/^(?:zh|chinese|中文|漢語|汉语)$/i.test(raw)) return "zh";
    const aliases = {
      english: "en", 英文: "en", 英語: "en",
      japanese: "ja", 日文: "ja", 日語: "ja", 日本語: "ja",
      korean: "ko", 韓文: "ko", 韓語: "ko", 한국어: "ko",
      spanish: "es", 西班牙文: "es", español: "es",
      french: "fr", 法文: "fr", français: "fr",
      german: "de", 德文: "de", deutsch: "de",
    };
    const lower = raw.toLowerCase();
    return aliases[lower] || lower.split(/[-_]/)[0];
  }

  function sameLanguage(a, b) {
    const tagA = normalizeLanguageTag(a);
    const tagB = normalizeLanguageTag(b);
    if (!tagA || !tagB) return false;
    if (tagA === tagB) return true;
    return (tagA === "zh" && tagB.startsWith("zh")) || (tagB === "zh" && tagA.startsWith("zh"));
  }

  function selectYoutubeTrack(snapshot, targetLanguage = "") {
    const tracks = Array.isArray(snapshot?.tracks) ? snapshot.tracks : [];
    const selected = snapshot?.selected;
    const chosen = tracks.find((track) => selected?.vssId && track.vssId === selected.vssId) ||
      tracks.find((track) => selected?.languageCode && track.languageCode === selected.languageCode && track.kind === selected.kind);
    if (chosen && (!targetLanguage || !sameLanguage(chosen.languageCode, targetLanguage))) return chosen;
    const pool = targetLanguage ? tracks.filter((track) => !sameLanguage(track.languageCode, targetLanguage)) : [];
    const candidates = pool.length ? pool : tracks;
    const defaultTrack = tracks[snapshot?.defaultIndex];
    return (defaultTrack && candidates.includes(defaultTrack) ? defaultTrack : null) ||
      candidates.find((track) => track.kind !== "asr") || candidates[0] || chosen || null;
  }

  function selectTargetYoutubeTrack(snapshot, sourceTrack, targetLanguage = "") {
    if (!sourceTrack || !targetLanguage || sameLanguage(sourceTrack.languageCode, targetLanguage)) return null;
    const tracks = Array.isArray(snapshot?.tracks) ? snapshot.tracks : [];
    const exact = tracks.find((track) => track !== sourceTrack && track.kind !== "asr" &&
      String(track.languageCode || "").toLowerCase() === String(targetLanguage).trim().toLowerCase());
    return exact || tracks.find((track) => track !== sourceTrack && track.kind !== "asr" &&
      sameLanguage(track.languageCode, targetLanguage)) || null;
  }

  function youtubeTrackKey(track) {
    return JSON.stringify([track?.languageCode, track?.kind || "", track?.vssId || ""]);
  }

  function youtubeCaptionUrl(track, snapshot) {
    const url = new URL(track.baseUrl);
    if (url.protocol !== "https:" || !/^(www|m)\.youtube\.com$/.test(url.hostname) ||
      url.pathname !== "/api/timedtext" || url.username || url.password ||
      url.searchParams.get("v") !== snapshot.videoId || url.searchParams.has("tlang")) throw new Error("Invalid YouTube caption URL.");
    for (const [key, value] of Object.entries({ ...snapshot.clientParams, xorb: "2", xobt: "3", xovt: "3", c: "WEB", cplayer: "UNIPLAYER" })) {
      if (["cbrand", "cbr", "cbrver", "cos", "cosver", "cplatform", "cver", "xorb", "xobt", "xovt", "c", "cplayer"].includes(key) && typeof value === "string" && value) url.searchParams.set(key, value);
    }
    const candidates = [...(snapshot.observedUrls || []).slice().reverse(), ...(snapshot.audioUrls || [])];
    for (const value of candidates) {
      let candidate;
      try { candidate = new URL(value); } catch { continue; }
      if (candidate.protocol !== "https:" || !/^(www|m)\.youtube\.com$/.test(candidate.hostname) || candidate.pathname !== "/api/timedtext") continue;
      if (candidate.searchParams.get("v") !== snapshot.videoId) continue;
      if (candidate.searchParams.get("lang") !== track.languageCode ||
        (candidate.searchParams.get("kind") || "") !== (track.kind || "") ||
        (candidate.searchParams.get("name") || "") !== (url.searchParams.get("name") || "")) continue;
      if (candidate.searchParams.get("pot")) {
        for (const [key, value] of candidate.searchParams) {
          if (!["fmt", "tlang"].includes(key)) url.searchParams.set(key, value);
        }
        break;
      }
    }
    url.searchParams.set("fmt", "json3");
    return url.href;
  }

  function subtitleTrackText(group, preferences) {
    return preferences.translationOnly && group.translation ? group.translation :
      [group.text, group.translation].filter(Boolean).join("\n");
  }

  function subtitleAtTime(chunks, time) {
    let lo = 0, hi = chunks.length - 1;
    while (lo <= hi) {
      const middle = (lo + hi) >> 1;
      const chunk = chunks[middle];
      if (time < chunk.start) hi = middle - 1;
      else if (time >= chunk.end) lo = middle + 1;
      else return chunk.groups.find((group) => group.start <= time && time < group.end) || null;
    }
    return null;
  }

  function updateNativeSubtitles(session, chunk) {
    const native = session.native;
    if (!native) return;
    const chunks = chunk ? [chunk] : session.chunks;
    try {
      for (const entry of chunks) {
        removeNativeSubtitleCues(native, native.cues.get(entry) || []);
        const cues = [];
        native.cues.set(entry, cues);
        for (const group of entry.groups) {
          const text = subtitleTrackText(group, session.preferences).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const cue = new VTTCue(group.start / 1000, group.end / 1000, text);
          cue.line = -3;
          native.track.addCue(cue);
          cues.push(cue);
        }
      }
    } catch {
      leaveNativeSubtitles(session);
      setSubtitleStatus("Use Expand for translated captions on this device.", true);
    }
  }

  function removeNativeSubtitleCues(native, cues) {
    for (const cue of cues) {
      try { native.track.removeCue(cue); } catch { /* YouTube may already have removed cues while reloading its player. */ }
    }
  }

  function enterNativeSubtitles(session) {
    if (session !== subtitleSession || typeof VTTCue !== "function") return;
    try {
      let track = nativeSubtitleTracks.get(session.video);
      if (!track) {
        track = session.video.addTextTrack("subtitles", "Touch Translate", "");
        nativeSubtitleTracks.set(session.video, track);
      }
      if (session.native) return;
      session.native = { track, cues: new Map(), previous: [] };
      for (const source of Array.from(session.video.textTracks)) {
        if (source !== track && source.mode === "showing") {
          session.native.previous.push(source);
          source.mode = "hidden";
        }
      }
      track.mode = "showing";
      updateNativeSubtitles(session);
    } catch (error) {
      leaveNativeSubtitles(session);
      setSubtitleStatus("Use Expand for translated captions on this device.", true);
    }
  }

  function leaveNativeSubtitles(session) {
    const native = session?.native;
    if (!native) return;
    for (const cues of native.cues.values()) removeNativeSubtitleCues(native, cues);
    native.track.mode = "disabled";
    for (const track of native.previous) if (track.mode === "hidden") track.mode = "showing";
    session.native = null;
  }

  function setSubtitleStatus(text, error = false) {
    if (!subtitleView) return;
    subtitleView.status.textContent = text;
    subtitleView.status.dataset.error = String(error);
    subtitleView.retry.hidden = !error;
    subtitleView.host.dataset.idle = String(!subtitleView.menu?.open && !text);
  }

  function renderSubtitles(session = subtitleSession) {
    if (!subtitleView || !session || session !== subtitleSession) return;
    clearTimeout(session.renderTimer);
    const ad = session.player.classList.contains("ad-showing") || session.player.classList.contains("ad-interrupting");
    const group = ad ? null : subtitleAtTime(session.chunks, session.video.currentTime * 1000);
    if (subtitleView.source.textContent !== (group?.text || "")) subtitleView.source.textContent = group?.text || "";
    if (subtitleView.translation.textContent !== (group?.translation || "")) subtitleView.translation.textContent = group?.translation || "";
    subtitleView.source.hidden = session.preferences.translationOnly && !!group?.translation;
    subtitleView.captions.hidden = !group || !!session.native;
    if (session.native) session.native.track.mode = ad ? "hidden" : "showing";
    if (!ad && session.video.paused === false && !session.video.ended) {
      session.renderTimer = setTimeout(() => renderSubtitles(session), 80);
    }
  }

  function toggleSubtitleExpanded(force) {
    const view = subtitleView;
    if (!view) return;
    const expanded = force ?? !view.player.classList.contains(`${SCRIPT_PREFIX}__expanded`);
    view.player.classList.toggle(`${SCRIPT_PREFIX}__expanded`, expanded);
    view.expand.setAttribute("aria-pressed", String(expanded));
    view.expand.textContent = expanded ? "Exit expand" : "Expand";
    if (view.menu) {
      view.menu.open = false;
      view.host.dataset.idle = String(!view.status.textContent);
    }
    window.dispatchEvent(new Event("resize"));
  }

  function mountSubtitleView(player, video) {
    const host = document.createElement("div");
    host.className = `${SCRIPT_PREFIX}__host`;
    host.dataset.touchTranslateUi = "";
    host.dataset.idle = "true";
    const toolbar = document.createElement("div");
    toolbar.className = `${SCRIPT_PREFIX}__toolbar`;
    const button = (text, action) => {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = text;
      element.addEventListener("click", (event) => { event.stopPropagation(); action(); });
      toolbar.append(element);
      return element;
    };
    const toggle = button("Translate CC", toggleYoutubeSubtitles);
    toggle.setAttribute("aria-pressed", "false");
    const preferences = loadSubtitlePreferences();
    const menu = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Captions";
    const controls = document.createElement("div");
    controls.className = `${SCRIPT_PREFIX}__preferences`;
    const preference = (text, key, type, min, max) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = type;
      if (type === "checkbox") input.checked = preferences[key];
      else {
        input.min = min;
        input.max = max;
        input.value = preferences[key];
        input.addEventListener("input", () => {
          preferences[key] = Number(input.value);
          applySubtitlePreferences(false);
        });
      }
      input.addEventListener("change", () => {
        preferences[key] = type === "checkbox" ? input.checked : Number(input.value);
        GM_setValue(PREFERENCES_KEY, preferences);
        applySubtitlePreferences(true);
        if (key === "smart" && subtitleSession) resegmentYoutubeSubtitles();
      });
      label.append(text, input);
      controls.append(label);
    };
    preference("Smart segmentation", "smart", "checkbox");
    preference("Translation only", "translationOnly", "checkbox");
    preference("Text size", "fontSize", "range", 14, 36);
    preference("Bottom position", "bottom", "range", 8, 35);
    menu.append(summary, controls);
    menu.addEventListener("toggle", () => {
      host.dataset.idle = String(!menu.open && !status.textContent);
    });
    toolbar.append(menu);
    const expand = button("Expand", () => toggleSubtitleExpanded());
    expand.setAttribute("aria-pressed", "false");
    controls.append(expand, button("API", () => {
      menu.open = false;
      host.dataset.idle = String(!status.textContent);
      configureSettings().catch(reportError);
    }));
    const retry = button("Retry", retryYoutubeSubtitles);
    retry.hidden = true;
    const status = document.createElement("span");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.className = `${SCRIPT_PREFIX}__status`;
    toolbar.append(status);
    const captions = document.createElement("div");
    captions.className = `${SCRIPT_PREFIX}__captions`;
    captions.hidden = true;
    const source = document.createElement("div"), translation = document.createElement("div");
    source.dir = translation.dir = "auto";
    translation.className = `${SCRIPT_PREFIX}__translation`;
    captions.append(source, translation);
    host.append(toolbar, captions);
    for (const type of ["click", "dblclick", "pointerdown", "keydown", "touchstart", "touchend"]) {
      toolbar.addEventListener(type, (event) => event.stopPropagation());
    }
    let autohideTimer;
    const noteActivity = (event) => {
      if (menu.open && event?.target && !menu.contains(event.target)) {
        menu.open = false;
        host.dataset.idle = String(!status.textContent);
      }
      host.dataset.autohide = "false";
      clearTimeout(autohideTimer);
      if (video.paused === false && !video.ended) {
        autohideTimer = setTimeout(() => { host.dataset.autohide = "true"; }, 3000);
      }
    };
    for (const type of ["pointerdown", "pointermove", "touchstart", "keydown"]) {
      player.addEventListener(type, noteActivity, { passive: true });
    }
    for (const type of ["play", "pause", "ended"]) {
      video.addEventListener(type, noteActivity);
    }
    player.append(host);
    const position = player.style.position;
    if (getComputedStyle(player).position === "static") player.style.position = "relative";
    subtitleView = { host, player, video, toggle, menu, expand, retry, status, captions, source, translation, preferences, position, autohideTimer: () => clearTimeout(autohideTimer) };
    applySubtitlePreferences();
  }

  function applySubtitlePreferences(updateNative = true) {
    if (!subtitleView) return;
    const preferences = subtitleView.preferences;
    subtitleView.host.style.setProperty("--subtitle-size", `${preferences.fontSize}px`);
    subtitleView.host.style.setProperty("--subtitle-bottom", `${preferences.bottom}%`);
    if (subtitleSession) {
      subtitleSession.preferences = { ...preferences };
      if (updateNative) updateNativeSubtitles(subtitleSession);
      renderSubtitles();
    }
  }
