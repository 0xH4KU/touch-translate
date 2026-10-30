  // Runs in the page world, with no GM APIs, settings, or translation credentials.
  function youtubeCaptionBridge(channel, maxBytes) {
    if (window.__touchYoutubeCaptionBridge) return;
    window.__touchYoutubeCaptionBridge = true;
    const observed = new Map();
    const loads = new Map();
    const originalFetch = window.fetch.bind(window);
    const originalOpen = XMLHttpRequest.prototype.open;
    const xhrUrls = new WeakMap();
    let enabledByUs = null;

    function captionUrl(value) {
      try {
        const url = new URL(value, location.href);
        return url.protocol === "https:" && /^(www|m)\.youtube\.com$/.test(url.hostname) &&
          !url.username && !url.password && url.pathname === "/api/timedtext" &&
          /^[\w-]{11}$/.test(url.searchParams.get("v") || "") ? url : null;
      } catch { return null; }
    }
    const trackKey = (url) => ["v", "lang", "kind", "name", "tlang"].map((key) => url.searchParams.get(key) || "").join("\u0000");
    function remember(value, text = "") {
      const url = captionUrl(value);
      if (!url) return;
      const key = trackKey(url);
      const prior = observed.get(key);
      const body = text.length <= maxBytes && text.trim().startsWith("{") ? text : "";
      observed.delete(key);
      observed.set(key, { url: url.href, body: body || prior?.body || "", at: Date.now() });
      while (observed.size > 6) observed.delete(observed.keys().next().value);
    }
    for (const resource of performance.getEntriesByType("resource")) remember(resource.name);
    window.fetch = function (...args) {
      const result = originalFetch(...args);
      const url = args[0]?.url || String(args[0]);
      if (captionUrl(url)) result.then((response) => {
        remember(response.url || url);
        if (Number(response.headers.get("content-length")) > maxBytes) return;
        response.clone().text().then((text) => remember(response.url || url, text)).catch(() => {});
      }).catch(() => {});
      return result;
    };
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      xhrUrls.set(this, String(url));
      this.addEventListener("load", () => {
        const responseUrl = this.responseURL || xhrUrls.get(this);
        if (!captionUrl(responseUrl)) return;
        let text = "";
        try { text = this.responseType === "json" ? JSON.stringify(this.response) : this.responseText; } catch { /* A binary response still provides a usable URL. */ }
        remember(responseUrl, text || "");
      }, { once: true });
      return originalOpen.call(this, method, url, ...rest);
    };
    function player() {
      return document.querySelector("#movie_player") || document.querySelector(".html5-video-player");
    }
    function snapshot() {
      const current = player();
      const response = current?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
      const videoId = response?.videoDetails?.videoId;
      const renderer = response?.captions?.playerCaptionsTracklistRenderer;
      const selected = current?.getOption?.("captions", "track");
      const tracks = (renderer?.captionTracks || []).filter((track) => captionUrl(track.baseUrl)).map((track) => ({
        baseUrl: track.baseUrl, languageCode: track.languageCode, kind: track.kind || "",
        vssId: track.vssId || "", name: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join("") || track.languageCode,
      }));
      return {
        videoId, live: !!response?.videoDetails?.isLive || !!response?.microformat?.playerMicroformatRenderer?.liveBroadcastDetails?.isLiveNow,
        selected: selected ? { languageCode: selected.languageCode, kind: selected.kind || "", vssId: selected.vssId || "" } : null,
        tracks,
        defaultIndex: renderer?.audioTracks?.[renderer.defaultAudioTrackIndex || 0]?.defaultCaptionTrackIndex,
        audioUrls: (current?.getAudioTrack?.()?.captionTracks || []).map((track) => track.url).filter((url) => captionUrl(url)),
        observedUrls: [...observed.values()].filter((entry) => Date.now() - entry.at < 300000).map((entry) => entry.url),
        clientParams: {
          ...Object.fromEntries([...new URLSearchParams(window.ytcfg?.get?.("DEVICE") || "")].filter(([key]) =>
            ["cbrand", "cbr", "cbrver", "cos", "cosver", "cplatform"].includes(key))),
          cver: current?.getWebPlayerContextConfig?.()?.innertubeContextClientVersion || "",
        },
      };
    }
    function toggleCaptions(turnOn, videoId) {
      const current = player();
      const button = current?.querySelector(".ytp-subtitles-button");
      if (!button || current?.getPlayerResponse?.()?.videoDetails?.videoId !== videoId) return;
      const on = button.getAttribute("aria-pressed") === "true";
      if (on === turnOn) return;
      if (typeof current.toggleSubtitles === "function") current.toggleSubtitles();
      else button.click();
    }
    window.addEventListener("message", async (event) => {
      const message = event.data;
      if (event.source !== window || event.origin !== location.origin || message?.channel !== channel ||
        message.reply || typeof message.id !== "string" || message.id.length > 100) return;
      const reply = (data, error) => window.postMessage({ channel, id: message.id, reply: true, data, error }, location.origin);
      try {
        if (message.action === "snapshot") reply(snapshot());
        else if (message.action === "enable") {
          const wasOff = player()?.querySelector(".ytp-subtitles-button")?.getAttribute("aria-pressed") === "false";
          toggleCaptions(true, message.videoId);
          if (wasOff) enabledByUs = { videoId: message.videoId, languageCode: message.languageCode, kind: message.kind || "" };
          reply(null);
        } else if (message.action === "restore") {
          if (enabledByUs?.videoId === message.videoId) {
            const current = snapshot().selected;
            if (!current || current.languageCode === enabledByUs.languageCode && current.kind === enabledByUs.kind) toggleCaptions(false, message.videoId);
            enabledByUs = null;
          }
          reply(null);
        } else if (message.action === "cancel") {
          loads.get(message.loadId)?.abort();
        } else if (message.action === "load") {
          const url = captionUrl(message.url);
          if (!url || url.searchParams.get("v") !== snapshot().videoId || url.searchParams.has("tlang")) throw new Error("Invalid caption request.");
          const cached = observed.get(trackKey(url));
          if (cached?.body && Date.now() - cached.at < 300000) { reply(cached.body); return; }
          const controller = new AbortController();
          loads.set(message.id, controller);
          try {
            const response = await originalFetch(url.href, { credentials: "same-origin", signal: controller.signal });
            if (!response.ok) throw new Error(`YouTube captions: HTTP ${response.status}.`);
            if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("YouTube captions are too large.");
            const text = await response.text();
            if (text.length > maxBytes) throw new Error("YouTube captions are too large.");
            reply(text);
          } finally { loads.delete(message.id); }
        }
      } catch (error) { reply(null, error?.name === "AbortError" ? "Caption request cancelled." : error?.message || "Could not read YouTube captions."); }
    });
  }

  function installCaptionBridge() {
    const textContent = `(${youtubeCaptionBridge.toString()})(${JSON.stringify(BRIDGE_CHANNEL)}, ${CAPTION_MAX_BYTES});`;
    try {
      if (typeof GM_addElement === "function") {
        GM_addElement("script", { textContent })?.remove();
      } else {
        const script = document.createElement("script");
        script.textContent = textContent;
        const nonce = document.querySelector("script[nonce]")?.nonce;
        if (nonce) script.nonce = nonce;
        (document.head || document.documentElement).append(script);
        script.remove();
      }
    } catch { /* A blocked bridge is reported when the user enables subtitles. */ }
  }

  function captionBridgeRequest(action, data = {}, signal) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let timer;
      const finish = (error, result) => {
        clearTimeout(timer);
        window.removeEventListener("message", receive);
        signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve(result);
      };
      const abort = () => {
        window.postMessage({ channel: BRIDGE_CHANNEL, id: `${id}-cancel`, action: "cancel", loadId: id }, location.origin);
        finish(cancelledError());
      };
      const receive = (event) => {
        const message = event.data;
        if (event.source !== window || event.origin !== location.origin || message?.channel !== BRIDGE_CHANNEL ||
          message.id !== id || message.reply !== true) return;
        finish(message.error ? new Error(String(message.error).slice(0, 300)) : null, message.data);
      };
      if (signal?.aborted) { reject(cancelledError()); return; }
      window.addEventListener("message", receive);
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        window.postMessage({ channel: BRIDGE_CHANNEL, id: `${id}-cancel`, action: "cancel", loadId: id }, location.origin);
        finish(new Error("YouTube did not answer. Reload the page and enable the userscript, then try again."));
      }, action === "load" ? 15000 : 2000);
      window.postMessage({ ...data, channel: BRIDGE_CHANNEL, id, action }, location.origin);
    });
  }
