  // Runs in the page world, with no GM APIs, settings, or translation credentials.
  function youtubeCaptionBridge(channel, maxBytes, root = window) {
    const doc = root.document || document;
    const ready = () => {
      doc.documentElement?.setAttribute?.("data-touch-youtube-bridge", "dom-v2");
      doc.dispatchEvent(new CustomEvent(`${channel}:ready`));
    };
    if (root.__touchYoutubeCaptionBridge === "dom-v2") { ready(); return; }
    const observed = new Map();
    const loads = new Map();
    const originalFetch = root.fetch.bind(root);
    const originalOpen = root.XMLHttpRequest.prototype.open;
    const xhrUrls = new WeakMap();
    let enabledByUs = null;

    function captionUrl(value) {
      try {
        const url = new URL(value, location.href);
        return url.protocol === "https:" && url.hostname === "www.youtube.com" &&
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
    for (const resource of root.performance?.getEntriesByType?.("resource") || []) remember(resource.name);
    const observeFetch = function (...args) {
      const result = originalFetch(...args);
      const url = args[0]?.url || String(args[0]);
      if (captionUrl(url)) result.then((response) => {
        remember(response.url || url);
        if (Number(response.headers.get("content-length")) > maxBytes) return;
        response.clone().text().then((text) => remember(response.url || url, text)).catch(() => {});
      }).catch(() => {});
      return result;
    };
    const observeOpen = function (method, url, ...rest) {
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
    // Read-only hooks must not prevent the bridge from answering player requests.
    try { root.fetch = observeFetch; } catch {}
    try { root.XMLHttpRequest.prototype.open = observeOpen; } catch {}
    function player() {
      return doc.querySelector("#movie_player") || doc.querySelector(".html5-video-player");
    }
    function snapshot() {
      const current = player();
      const response = current?.getPlayerResponse?.() || root.ytInitialPlayerResponse;
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
          ...Object.fromEntries([...new URLSearchParams(root.ytcfg?.get?.("DEVICE") || "")].filter(([key]) =>
            ["cbrand", "cbr", "cbrver", "cos", "cosver", "cplatform"].includes(key))),
          cver: current?.getWebPlayerContextConfig?.()?.innertubeContextClientVersion || "",
        },
      };
    }
    function captionsActive(current = player()) {
      const button = current?.querySelector?.(".ytp-subtitles-button");
      if (button?.hasAttribute("aria-pressed")) return button.getAttribute("aria-pressed") === "true";
      return Boolean(current?.getOption?.("captions", "track")?.languageCode);
    }
    function toggleCaptions(turnOn, videoId) {
      const current = player();
      const response = current?.getPlayerResponse?.() || root.ytInitialPlayerResponse;
      if (!current || response?.videoDetails?.videoId !== videoId) return;
      if (captionsActive(current) === turnOn) return;
      const button = current.querySelector?.(".ytp-subtitles-button");
      if (typeof current.toggleSubtitles === "function") current.toggleSubtitles();
      else if (button) button.click();
      else if (turnOn) current.loadModule?.("captions");
    }
    // DOM events carry JSON strings across userscript worlds without Window identity checks.
    doc.addEventListener(`${channel}:request`, async (event) => {
      if (typeof event.detail !== "string" || event.detail.length > 16384) return;
      let message;
      try { message = JSON.parse(event.detail); } catch { return; }
      if (message?.channel !== channel ||
        message.reply || typeof message.id !== "string" || message.id.length > 100) return;
      const reply = (data, error) => doc.dispatchEvent(new CustomEvent(`${channel}:reply`, {
        detail: JSON.stringify({ channel, id: message.id, reply: true, data, error }),
      }));
      try {
        if (message.action === "snapshot") reply(snapshot());
        else if (message.action === "enable") {
          const wasOff = !captionsActive();
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
    root.__touchYoutubeCaptionBridge = "dom-v2";
    ready();
  }

  function installCaptionBridge() {
    const installed = () => document.documentElement?.getAttribute?.("data-touch-youtube-bridge") === "dom-v2";
    if (installed()) return;
    const target = document.head || document.documentElement;
    const nonce = document.querySelector?.("script[nonce]")?.nonce;
    const textContent = `(${youtubeCaptionBridge.toString()})(${JSON.stringify(BRIDGE_CHANNEL)}, ${CAPTION_MAX_BYTES});`;
    const attributes = nonce ? { textContent, nonce } : { textContent };
    if (target && typeof GM_addElement === "function") {
      try {
        const element = document.head
          ? GM_addElement("script", attributes)
          : GM_addElement(target, "script", attributes);
        if (installed()) element?.remove?.();
      } catch {
        try {
          const element = GM_addElement("script", { textContent });
          if (installed()) element?.remove?.();
        } catch {}
      }
    }
    if (target && !installed()) {
      try {
        const script = document.createElement("script");
        if (nonce) script.nonce = nonce;
        script.textContent = textContent;
        target.append(script);
        if (installed()) script.remove();
      } catch {}
    }
    if (!installed() && typeof unsafeWindow !== "undefined") {
      try { youtubeCaptionBridge(BRIDGE_CHANNEL, CAPTION_MAX_BYTES, unsafeWindow); } catch {}
    }
  }

  function captionBridgeRequest(action, data = {}, signal) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let timer;
      let sent = false;
      let settled = false;
      const dispatch = (message) => document.dispatchEvent(new CustomEvent(`${BRIDGE_CHANNEL}:request`, {
        detail: JSON.stringify({ ...message, channel: BRIDGE_CHANNEL }),
      }));
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        document.removeEventListener(`${BRIDGE_CHANNEL}:reply`, receive);
        document.removeEventListener(`${BRIDGE_CHANNEL}:ready`, send);
        signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve(result);
      };
      const abort = () => {
        if (sent) dispatch({ id: `${id}-cancel`, action: "cancel", loadId: id });
        finish(cancelledError());
      };
      const receive = (event) => {
        if (typeof event.detail !== "string" || event.detail.length > CAPTION_MAX_BYTES * 2 + 4096) return;
        let message;
        try { message = JSON.parse(event.detail); } catch { return; }
        if (message?.channel !== BRIDGE_CHANNEL ||
          message.id !== id || message.reply !== true) return;
        finish(message.error ? new Error(String(message.error).slice(0, 300)) : null, message.data);
      };
      const send = () => {
        if (sent || settled || document.documentElement?.getAttribute?.("data-touch-youtube-bridge") !== "dom-v2") return;
        sent = true;
        Promise.resolve().then(() => {
          if (!settled) dispatch({ ...data, id, action });
        }).catch((error) => finish(error));
      };
      if (signal?.aborted) { reject(cancelledError()); return; }
      document.addEventListener(`${BRIDGE_CHANNEL}:reply`, receive);
      document.addEventListener(`${BRIDGE_CHANNEL}:ready`, send);
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        if (sent) dispatch({ id: `${id}-cancel`, action: "cancel", loadId: id });
        finish(new Error(sent
          ? `YouTube caption request timed out (${action}). Reload the page and try again.`
          : "YouTube caption bridge could not start. Reload the page and check that Tampermonkey can run scripts on YouTube."));
      }, action === "load" ? 15000 : 2000);
      installCaptionBridge();
      send();
    });
  }
