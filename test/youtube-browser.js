export async function runYoutubeBrowserChecks(source) {
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const check = async (name, run) => { await run(); results.push(`PASS ${name}`); };
  const until = async (condition) => {
    const deadline = performance.now() + 3000;
    while (!condition()) {
      if (performance.now() > deadline) throw new Error("Timed out waiting for the subtitle fixture");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  const videoId = "fixture0001";
  history.replaceState(null, "", `/watch?v=${videoId}`);
  const player = document.querySelector("#movie_player");
  const video = player.querySelector("video");
  const cc = player.querySelector(".ytp-subtitles-button");
  let selected = null;
  const tracks = [
    { baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`, languageCode: "en", kind: "asr", vssId: "a.en", name: { simpleText: "English (auto)" } },
    { baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=ja`, languageCode: "ja", vssId: ".ja", name: { simpleText: "Japanese" } },
  ];
  player.getPlayerResponse = () => ({ videoDetails: { videoId }, captions: { playerCaptionsTracklistRenderer: {
    captionTracks: tracks, audioTracks: [{ defaultCaptionTrackIndex: 0 }],
  } } });
  player.getOption = () => selected;
  player.getAudioTrack = () => ({ captionTracks: tracks.map((track) => ({ ...track,
    url: track.baseUrl + (cc.getAttribute("aria-pressed") === "true" ? "&pot=enabled-caption-token" : "&pot=initial-caption-token"),
  })) });
  player.toggleSubtitles = () => {
    const on = cc.getAttribute("aria-pressed") !== "true";
    cc.setAttribute("aria-pressed", String(on));
    selected = on ? { languageCode: "en", kind: "asr", vssId: "a.en" } : null;
  };
  Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 1 });
  const events = Array.from({ length: 32 }, (_, index) => ({
    tStartMs: index * 5000, dDurationMs: 4000,
    segs: [{ utf8: `A complete caption ${index}.`, tOffsetMs: 0 }],
  }));
  const originalFetch = window.fetch.bind(window);
  let captionLoads = 0;
  let firstCaptionFailure = true;
  window.fetch = (input, options) => {
    const url = input?.url || String(input);
    if (!url.startsWith("https://www.youtube.com/api/timedtext")) return originalFetch(input, options);
    captionLoads++;
    if (firstCaptionFailure) { firstCaptionFailure = false; return Promise.resolve(new Response("", { status: 403 })); }
    return Promise.resolve(new Response(JSON.stringify({ events }), { headers: { "Content-Type": "application/json" } }));
  };
  const settings = { apiFormat: "chat-completions", baseURL: "https://api.example.invalid/v1", model: "fixture-model", apiKey: "fixture-private-secret", targetLanguage: "zh-TW", thinkingLevel: "low" };
  const store = { "settings-v1": { ...settings } };
  const requests = [], menus = [];
  source = source.replace("  // Test interface", "  globalThis.youtubeBrowser = { startYoutubeSubtitles, stopYoutubeSubtitles, refreshYoutubePlayer, checkSubtitleTrack, renderSubtitles, enterNativeSubtitles, leaveNativeSubtitles, captionBridgeRequest, getSession: () => subtitleSession, getView: () => subtitleView };\n  // Test interface");
  new Function("GM_getValue", "GM_setValue", "GM_deleteValue", "GM_registerMenuCommand", "GM_setClipboard", "GM_xmlhttpRequest", "GM_info", "GM_addElement", source)(
    (key, fallback) => structuredClone(store[key] ?? fallback),
    (key, value) => { store[key] = structuredClone(value); },
    (key) => { delete store[key]; },
    (label, handler) => { menus.push({ label, handler }); },
    () => {},
    (options) => { const request = { options, aborted: false }; requests.push(request); return { abort() { request.aborted = true; options.onabort?.(); } }; },
    { script: { version: "browser-test" } },
    (tag, attributes) => { const element = Object.assign(document.createElement(tag), attributes); document.head.append(element); return element; },
  );
  const api = globalThis.youtubeBrowser;
  const reply = (request, translation = "測試字幕譯文") => {
    const input = JSON.parse(JSON.parse(request.options.data).messages[1].content);
    const ranges = input.fixedGroups || input.fragments.map((fragment) => ({ from: fragment.id, to: fragment.id }));
    request.options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify({ groups: ranges.map((range) => ({ ...range, translation })) }),
    } }] }) });
  };
  const finishPrefetch = async (translation) => {
    let completed = 0;
    while (api.getSession()?.running) {
      const request = requests.find((entry) => !entry.answered && !entry.aborted);
      if (request) { request.answered = true; reply(request, translation); completed++; }
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (completed > 10) throw new Error("The fixture prefetched beyond its window");
    }
  };

  await check("Complete userscript docks next to CC and auto-starts by default", async () => {
    assert(menus.length === 6, "All six menu commands must initialize");
    const view = api.getView();
    assert(!!view, "The controls must mount on the player");
    assert(view.trigger.previousElementSibling === cc, "The single trigger button must dock right next to YouTube's CC button");
    assert(view.trigger.getBoundingClientRect().height >= 44, "Trigger button must retain a 44px touch target");
    assert(view.controls.hidden, "Detailed preferences must start closed behind the single trigger button");
    view.trigger.click();
    assert(!view.controls.hidden && view.toggle.getBoundingClientRect().height >= 44, "Clicking the trigger button must open detailed preferences");
    view.trigger.click();
    assert(view.controls.hidden, "Clicking the trigger button again must close detailed preferences");
    assert(!window.GM_xmlhttpRequest && !JSON.stringify(window.__touchYoutubeCaptionBridge).includes(settings.apiKey), "The page bridge must not receive privileged APIs or the translation key");
    await until(() => requests.length > 0);
    assert(view.trigger.dataset.active === "true", "Default auto-start must mark the trigger active");
    api.stopYoutubeSubtitles();
    await new Promise((resolve) => setTimeout(resolve, 20));
    requests.length = 0;
    captionLoads = 0;
    firstCaptionFailure = true;
  });

  await check("Page bridge restricts caption requests and restores only its own CC change", async () => {
    await api.captionBridgeRequest("enable", { videoId, languageCode: "en", kind: "asr" });
    assert(cc.getAttribute("aria-pressed") === "true", "The fallback must be able to enable YouTube CC");
    await api.captionBridgeRequest("restore", { videoId });
    assert(cc.getAttribute("aria-pressed") === "false", "Stopping must restore CC when the plugin enabled it");
    await api.captionBridgeRequest("enable", { videoId, languageCode: "en", kind: "asr" });
    selected = { languageCode: "ja", kind: "", vssId: ".ja" };
    await api.captionBridgeRequest("restore", { videoId });
    assert(cc.getAttribute("aria-pressed") === "true" && selected.languageCode === "ja", "A subsequent user language choice must be preserved");
    selected = null;
    cc.setAttribute("aria-pressed", "false");
    const count = captionLoads;
    try {
      await api.captionBridgeRequest("load", { url: "https://evil.example/api/timedtext?v=" + videoId });
      throw new Error("The bridge accepted an unrelated URL");
    } catch (error) { assert(error.message.includes("Invalid caption request"), "The bridge must reject unrelated URLs"); }
    assert(captionLoads === count, "Rejected bridge requests must not reach the network");
    const controller = new AbortController();
    const cancelled = api.captionBridgeRequest("snapshot", {}, controller.signal);
    controller.abort();
    try { await cancelled; throw new Error("The bridge ignored cancellation"); }
    catch (error) { assert(error.name === "AbortError", "Cancellation must settle the bridge immediately"); }
  });

  await check("Bridge loads captions, translates nearby cues, and renders plain text safely", async () => {
    await api.startYoutubeSubtitles();
    await until(() => requests.length > 0);
    assert(captionLoads === 2 && cc.getAttribute("aria-pressed") === "true", "An expired caption token must recover by enabling CC and re-reading the player URL");
    await finishPrefetch('<img src=x onerror="window.subtitleXss=true"> 譯文');
    api.renderSubtitles();
    const view = api.getView();
    assert(view.source.textContent.includes("caption 0"), "The active source caption must render");
    assert(view.translation.textContent.includes("<img"), "API output must render as literal text");
    assert(!view.captions.querySelector("img") && !window.subtitleXss, "Caption text must never become HTML");
    assert(getComputedStyle(document.querySelector(".ytp-caption-window-container")).visibility === "hidden", "Native page captions must be hidden while the overlay is active");
    assert(requests.length <= 3, "Only the current look-ahead window should be translated");
    assert(Object.keys(store["youtube-cache-v1"]).length === requests.length, "Successful batches must be cached");
    assert(!JSON.stringify(store["youtube-cache-v1"]).includes("A complete caption"), "Source captions must not be persisted");
  });

  await check("Captions sit at the bottom and rise above visible playback controls", async () => {
    const view = api.getView();
    const chrome = player.querySelector(".ytp-chrome-bottom");
    const gap = () => player.getBoundingClientRect().bottom - view.captions.getBoundingClientRect().bottom;
    player.classList.add("ytp-autohide");
    await until(() => Math.abs(gap() - 8) < 1);
    player.classList.remove("ytp-autohide");
    await until(() => view.captions.getBoundingClientRect().bottom <= chrome.getBoundingClientRect().top - 7);
    assert(gap() >= chrome.getBoundingClientRect().height + 7, "Captions must clear the entire control bar");
    chrome.style.height = "20%";
    player.style.height = "300px";
    await until(() => Math.abs(gap() - 68) < 1);
    chrome.style.height = "";
    player.style.height = "";
    player.classList.add("ytp-autohide");
    await until(() => Math.abs(gap() - 8) < 1);
    player.classList.remove("ytp-autohide");
  });

  await check("Mobile controls respect hidden ancestors and ignore the volume slider", async () => {
    const view = api.getView();
    const wrapper = document.createElement("div");
    const bottom = document.createElement("div");
    bottom.className = "player-controls-bottom";
    bottom.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:76px";
    wrapper.style.opacity = "0";
    wrapper.append(bottom);
    const volume = document.createElement("div");
    volume.setAttribute("role", "slider");
    volume.style.cssText = "position:absolute;bottom:110px;left:10px;width:40px;height:10px";
    player.classList.add("ytp-autohide");
    player.append(wrapper, volume);
    const gap = () => player.getBoundingClientRect().bottom - view.captions.getBoundingClientRect().bottom;
    await until(() => Math.abs(gap() - 8) < 1);
    wrapper.style.opacity = "1";
    await until(() => Math.abs(gap() - 84) < 1);
    assert(view.captions.getBoundingClientRect().bottom <= bottom.getBoundingClientRect().top - 7, "Mobile captions must clear the visible progress controls");
    bottom.hidden = true;
    await until(() => Math.abs(gap() - 8) < 1);
    wrapper.remove();
    volume.remove();
    player.classList.remove("ytp-autohide");
  });

  await check("Display controls and web expansion update the active player", async () => {
    const view = api.getView();
    const checkbox = [...view.host.querySelectorAll("label")].find((label) => label.textContent.includes("Translation only")).querySelector("input");
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));
    assert(view.source.hidden, "Translation-only mode must hide the source");
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    const size = [...view.host.querySelectorAll("label")].find((label) => label.textContent.includes("Text size")).querySelector("input");
    const originalSize = size.value;
    size.value = "30";
    size.dispatchEvent(new Event("input"));
    assert(getComputedStyle(view.captions).fontSize === "30px", "Dragging the size slider must preview the font size immediately on input");
    size.value = "28";
    size.dispatchEvent(new Event("change"));
    assert(getComputedStyle(view.captions).fontSize === "28px", "The size slider must affect the actual rendered text on mobile and desktop");
    size.value = originalSize;
    size.dispatchEvent(new Event("change"));
    const priorLoads = captionLoads;
    const smartBox = [...view.host.querySelectorAll("label")].find((label) => label.textContent.includes("Smart segmentation")).querySelector("input");
    smartBox.checked = false;
    smartBox.dispatchEvent(new Event("change"));
    await finishPrefetch();
    assert(captionLoads === priorLoads, "Toggling smart segmentation must re-segment in memory without re-downloading YouTube captions");
    smartBox.checked = true;
    smartBox.dispatchEvent(new Event("change"));
    await finishPrefetch();
    view.trigger.click();
    assert(!view.controls.hidden, "Trigger button must open the preferences panel");
    view.expand.click();
    assert(view.controls.hidden, "Expanding must close the open preferences menu");
    assert(player.classList.contains("touch-youtube-translate__expanded"), "Expand must keep the overlay and video in one player");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    assert(!player.classList.contains("touch-youtube-translate__expanded"), "Escape must exit expansion");
  });

  await check("Native text tracks retain source timing and clean up after fullscreen", async () => {
    const session = api.getSession();
    api.enterNativeSubtitles(session);
    const track = session.native?.track;
    assert(track?.mode === "showing" && track.cues.length > 0, "A real browser subtitle track must be populated");
    assert(track.cues[0].startTime === 0 && track.cues[0].endTime === 4, "Cue times must come directly from the source track");
    assert(track.cues[0].line === "auto", "Native fullscreen must use the browser's automatic caption placement");
    assert(track.cues[0].text.includes("&lt;img"), "Native cue markup must be escaped");
    track.removeCue(track.cues[0]);
    api.leaveNativeSubtitles(session);
    assert(track.mode === "disabled" && !track.cues?.length, "Leaving native fullscreen must clear and disable the injected track");
  });

  await check("Seeking aborts obsolete work and rejects a late result", async () => {
    video.currentTime = 100;
    video.dispatchEvent(new Event("seeking"));
    await until(() => requests.some((entry) => !entry.answered && !entry.aborted));
    const pending = requests.find((entry) => !entry.answered && !entry.aborted);
    const size = Object.keys(store["youtube-cache-v1"]).length;
    video.currentTime = 1;
    video.dispatchEvent(new Event("seeking"));
    assert(pending.aborted, "Seeking must abort the old provider request");
    pending.answered = true;
    reply(pending, "This obsolete reply must not render");
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert(Object.keys(store["youtube-cache-v1"]).length === size, "A late reply must not enter the cache");
    assert(!api.getView().translation.textContent.includes("obsolete"), "A late reply must not replace current captions");
  });

  await check("Ads hide captions and pause new translation work", async () => {
    const count = requests.length;
    player.classList.add("ad-showing");
    api.refreshYoutubePlayer();
    assert(api.getView().captions.hidden, "Content captions must disappear during ads");
    assert(requests.length === count, "An ad must not start translation work");
    player.classList.remove("ad-showing");
  });

  await check("Changing the YouTube caption language replaces the session", async () => {
    const previous = api.getSession();
    selected = { languageCode: "ja", kind: "", vssId: ".ja" };
    await api.checkSubtitleTrack(previous);
    await until(() => api.getSession() && api.getSession() !== previous && api.getSession().trackKey);
    assert(previous.controller.signal.aborted, "The previous language session must be cancelled");
    assert(api.getSession().trackKey.includes("ja"), "The newly selected caption track must be used");
    await finishPrefetch();
  });

  await check("Native target-language subtitle track merges directly without API calls", async () => {
    const zhTrack = { baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=zh-TW`, languageCode: "zh-TW", vssId: ".zh-TW", name: { simpleText: "Chinese (Taiwan)" } };
    tracks.push(zhTrack);
    selected = { languageCode: "zh-TW", kind: "", vssId: ".zh-TW" };
    const priorRequests = requests.length;
    await api.startYoutubeSubtitles();
    await until(() => api.getSession()?.nativeBilingual);
    api.renderSubtitles();
    assert(requests.length === priorRequests, "Direct bilingual synthesis must not call the translation API");
    assert(api.getView().source.textContent.includes("caption 0"), "Original source track must be shown even when YouTube selected the target track");
    assert(api.getView().translation.textContent.includes("caption 0"), "Native target track must populate the translation line");
    tracks.pop();
    selected = { languageCode: "ja", kind: "", vssId: ".ja" };
  });

  await check("Changing API settings and navigating away cleanly stop captions", async () => {
    store["settings-v1"].targetLanguage = "en";
    api.refreshYoutubePlayer();
    assert(!api.getSession(), "New API settings must cancel the previous session");
    history.replaceState(null, "", "/");
    api.refreshYoutubePlayer();
    assert(!api.getView(), "Leaving a watch page must remove the controls");
    assert(getComputedStyle(document.querySelector(".ytp-caption-window-container")).visibility !== "hidden", "Stopping must restore the native caption display");
  });
  return results;
}
