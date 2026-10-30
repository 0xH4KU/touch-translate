export async function runBrowserChecks(textSource, imageSource, youtubeSource) {
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const check = async (name, run) => { await run(); results.push(`PASS ${name}`); };
  const tick = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
  const article = document.querySelector("article");
  const settings = { apiFormat: "chat-completions", baseURL: "https://api.example.invalid/v1", model: "browser-model", apiKey: "synthetic-key", targetLanguage: "zh-TW", thinkingLevel: "low" };
  const stores = { text: { "settings-v1": { ...settings } }, image: { "settings-v1": { ...settings } }, youtube: { "settings-v1": { ...settings } } };
  const requests = [], menus = [];
  const capture = (source, kind, functions) => source.replace("  // Test interface", `  globalThis.browser${kind} = { ${functions} };\n  // Test interface`);
  textSource = capture(textSource, "Text", "translateElements, cancelJob, readySettings, configureSettings, parseImportedSettings, startPageTranslation, getPageTask: () => pageTask");
  imageSource = capture(imageSource, "Image", "translateImage, openImageViewer, closeImageViewer, ensureImageOverlay, readySettings, configureSettings");
  youtubeSource = capture(youtubeSource, "Youtube", "readySettings, configureSettings");
  const load = (kind, source) => new Function(
    "GM_getValue", "GM_setValue", "GM_deleteValue", "GM_registerMenuCommand", "GM_setClipboard", "GM_xmlhttpRequest", "GM_info", "GM_addElement", source,
  )(
    (key, fallback) => structuredClone(stores[kind][key] ?? fallback),
    (key, value) => { stores[kind][key] = structuredClone(value); },
    (key) => { delete stores[kind][key]; },
    (name, handler) => { menus.push({ kind, name, handler }); },
    () => {},
    (options) => { requests.push({ kind, options }); return { abort() { options.onabort?.(); } }; },
    { script: { version: "browser-test" } },
    (tag, attributes) => { const element = Object.assign(document.createElement(tag), attributes); document.head.append(element); return element; },
  );
  load("text", textSource);
  load("image", imageSource);
  load("youtube", youtubeSource);
  const t = globalThis.browserText, im = globalThis.browserImage;
  const paragraph = (text) => { const p = document.createElement("p"); p.textContent = text; article.append(p); return p; };
  const image = async (label) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = "black"; ctx.fillText(label, 20, 80);
    const img = document.createElement("img"); img.src = canvas.toDataURL(); article.append(img);
    await img.decode(); return img;
  };
  const textReply = (options, text) => options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translations: [text] }) } }] }) });
  const imageReply = (options, text) => options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ has_text: true, regions: [{ box_2d: [100, 100, 300, 700], translation: text }] }) } }] }) });
  const touch = (target, id, x, y) => new Touch({ identifier: id, target, clientX: x, clientY: y });
  const send = (target, type, touches, changedTouches = touches) => target.dispatchEvent(new TouchEvent(type, { bubbles: true, composed: true, cancelable: true, touches, targetTouches: touches, changedTouches }));
  const swipe = (target, fingers = 1) => {
    const rect = target.getBoundingClientRect(), x = Math.max(40, rect.left + 20), y = rect.top + 10;
    const points = (dx) => Array.from({ length: fingers }, (_, n) => touch(target, n + 1, x + dx, y + n * 30));
    send(target, "touchstart", points(0));
    send(target, "touchmove", points(70));
    send(target, "touchend", [], points(70));
  };

  await check("All three complete userscripts initialize with separate storage", async () => {
    assert(menus.length === 17, "All scripts must register their menus");
    assert(document.querySelectorAll("style[data-touch-translate], style[data-touch-image-translate], style[data-touch-youtube-translate]").length === 3, "All stylesheets must load");
    assert(!document.querySelector(".touch-image-translate__overlay"), "Idle images should not create overlays");
  });

  await check("A normal paragraph swipe still translates", async () => {
    const p = paragraph("A normal reading paragraph.");
    const start = requests.length;
    swipe(p);
    await new Promise(resolve => setTimeout(resolve, 110));
    const pending = requests.slice(start).filter(r => r.kind === "text");
    assert(pending.length === 1, "One swipe must send one text request");
    textReply(pending[0].options, "一般段落的譯文。");
    await tick();
    assert(p.nextElementSibling?.textContent === "一般段落的譯文。", "The translated paragraph must render");
  });

  await check("Concurrent text requests preserve both persistent cache entries", async () => {
    delete stores.text["cache-v1"];
    const a = paragraph("First independent paragraph."), b = paragraph("Second independent paragraph.");
    const start = requests.length;
    const one = t.translateElements([a]), two = t.translateElements([b]);
    await tick();
    const pending = requests.slice(start).filter(r => r.kind === "text");
    assert(pending.length === 2, "The fixture must start concurrent text requests");
    textReply(pending[0].options, "第一段。"); await one;
    textReply(pending[1].options, "第二段。"); await two;
    assert(Object.keys(stores.text["cache-v1"]).length === 2, "Both text translations must remain cached");
  });

  let imgA, imgB;
  await check("Concurrent images preserve cache and the latest viewer intent", async () => {
    imgA = await image("Image A"); imgB = await image("Image B");
    const start = requests.length;
    const one = im.translateImage(imgA), two = im.translateImage(imgB);
    await tick();
    const pending = requests.slice(start).filter(r => r.kind === "image");
    assert(pending.length === 2, "The fixture must start two image requests");
    imageReply(pending[1].options, "圖片乙。"); await two;
    imageReply(pending[0].options, "圖片甲。"); await one;
    assert(Object.keys(stores.image["image-cache-v1"]).length === 2, "Both image results must remain cached");
    assert(document.querySelector(".touch-image-translate__viewer-img")?.src === imgB.src, "A late older result must not replace the newest image");
    assert(im.ensureImageOverlay(imgA).result.translation.includes("圖片甲"), "The older result must still be available for manual reopening");
  });

  await check("Viewer UI is isolated from one-finger and four-finger text gestures", async () => {
    const target = document.querySelector(".touch-image-translate__viewer-active .touch-image-translate__text");
    const count = requests.length;
    swipe(target);
    const points = Array.from({ length: 4 }, (_, n) => touch(target, n + 10, 80 + n * 20, 100));
    send(target, "touchstart", points); send(target, "touchend", [], points);
    await new Promise(resolve => setTimeout(resolve, 110));
    assert(requests.length === count, "Viewer gestures must not send text for translation");
    assert(!t.getPageTask(), "A four-finger tap inside the viewer must not start page translation");
  });

  await check("Single-region navigation is hidden by actual CSS", async () => {
    const header = document.querySelector(".touch-image-translate__viewer [data-sheet-header]");
    assert(header.hidden && getComputedStyle(header).display === "none", "A hidden single-region header must not be visible");
    im.closeImageViewer();
  });

  await check("Two-finger image swipes reopen results without another request", async () => {
    const count = requests.length;
    swipe(imgA, 2);
    await tick();
    assert(document.querySelector(".touch-image-translate__viewer-img")?.src === imgA.src, "Two-finger swipe must reopen the image");
    assert(requests.length === count, "Reopening must use the existing result");
    im.closeImageViewer();
  });

  await check("Closing the viewer prevents a pending older image from reopening it", async () => {
    const img = await image("Image C");
    const pending = im.translateImage(img);
    await tick();
    const options = requests.at(-1).options;
    im.openImageViewer(imgA, im.ensureImageOverlay(imgA).result);
    im.closeImageViewer();
    imageReply(options, "稍後完成的圖片。"); await pending;
    assert(!document.querySelector(".touch-image-translate__viewer"), "A pending result must respect a later close action");
  });

  await check("Each plugin opens only one settings dialog for concurrent callers", async () => {
    for (const [kind, suite, prefix] of [["text", t, "touch-translate"], ["image", im, "touch-image-translate"], ["youtube", globalThis.browserYoutube, "touch-youtube-translate"]]) {
      const saved = stores[kind]["settings-v1"];
      delete stores[kind]["settings-v1"];
      const one = suite.readySettings(), two = suite.readySettings();
      const dialogs = [...document.querySelectorAll(`dialog.${prefix}__${kind === "text" ? "settings-dialog" : "settings"}`)];
      assert(dialogs.length === 1, "Concurrent settings requests must reuse one dialog");
      dialogs[0].close(); await Promise.all([one, two]);
      stores[kind]["settings-v1"] = saved;
    }
  });

  await check("Settings dialog saves selected thinking level independently", async () => {
    const saved = stores.text["settings-v1"];
    stores.text["settings-v1"] = { ...settings, apiFormat: "gemini-native", model: "gemini-3.5-flash-lite", thinkingLevel: "medium" };
    const pending = t.configureSettings();
    const dialog = document.querySelector(".touch-translate__settings-dialog");
    const select = dialog.querySelector('[name="thinkingLevel"]');
    assert(select.value === "medium", "The thinking level control must reflect stored settings");
    select.value = "high";
    dialog.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await pending;
    assert(stores.text["settings-v1"].thinkingLevel === "high", "Saving settings must update thinking level");
    assert(stores.image["settings-v1"].model === "browser-model", "Saving text settings must not change image settings");
    stores.text["settings-v1"] = saved;
  });

  await check("Page translation observes real content and skips suite UI", async () => {
    const count = requests.length;
    const p = paragraph("Automatically translate this paragraph.");
    const ui = document.createElement("div"); ui.dataset.touchTranslateUi = "";
    const title = document.createElement("h2"); title.textContent = "Internal controls must never be translated"; ui.append(title); article.append(ui);
    await t.startPageTranslation();
    await new Promise(resolve => setTimeout(resolve, 120));
    const pending = requests.slice(count).filter(r => r.kind === "text");
    assert(pending.length > 0, "The normal IntersectionObserver initialization must schedule content");
    const body = JSON.parse(pending[0].options.data);
    assert(!body.messages[1].content.includes(title.textContent), "Suite UI must be excluded from page translation");
    await t.startPageTranslation();
    assert(!t.getPageTask(), "The page translation action must stop and clean up observers");
    assert(!p.hasAttribute("aria-busy"), "Stopping must restore accessibility state");
  });

  return results;
}
