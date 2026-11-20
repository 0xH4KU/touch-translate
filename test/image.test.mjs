import assert from "node:assert/strict";
import { createHarness, cacheSettings, googleBaseURL } from "./fixtures.mjs";

const { imageApi, context, document, body, transport } = createHarness();

// 1. Region parsing, macro-block merging, noise filtering, and validation.
const merged = imageApi.parseImageTranslation(`\`\`\`json
${JSON.stringify({
  has_text: true,
  regions: [
    { box_2d: [10, 20, 32, 95], translation: "9:41 AM" },
    { box_2d: [80, 100, 115, 280], translation: "@author_handle" },
    { box_2d: [140, 100, 180, 800], translation: "第一段第一行" },
    { box_2d: [188, 100, 228, 790], translation: "第一段第二行" },
    { box_2d: [500, 100, 560, 700], translation: "獨立區塊" },
    { box_2d: [980, 900, 985, 970], translation: "微小浮水印" },
  ],
})}\n\`\`\``);
assert.equal(merged.hasText, true);
assert.equal(merged.regions.length, 2);
assert.deepEqual([...merged.regions[0].box_2d], [140, 100, 228, 800]);
assert.equal(merged.regions[0].translation, "第一段第一行\n第一段第二行");
assert.equal(merged.translation, "[1] 第一段第一行\n第一段第二行\n\n[2] 獨立區塊");
assert.equal(imageApi.parseImageTranslation('{"has_text":false,"regions":[]}').hasText, false);
assert.throws(() => imageApi.parseImageTranslation(""), /The AI output was empty/);
assert.throws(() => imageApi.parseImageTranslation('{"has_text":true,"regions":[{"box_2d":[300,100,300,400],"translation":"bad"}]}'), /Response format mismatch/);

// 2. OCR settings, Google/Azure response parsing, ID-grouped translation, and 429 retry.
assert.equal(imageApi.cleanOcrSettings({}).provider, "none");
assert.throws(() => imageApi.cleanOcrSettings({ provider: "azure", apiKey: "k", endpoint: "http://x.azure.com" }), /HTTPS/);
const googleUnits = imageApi.parseOcrResponse("google", {
  responses: [{
    fullTextAnnotation: {
      pages: [{
        width: 400, height: 200,
        blocks: [{ paragraphs: [{
          boundingBox: { vertices: [{ x: 40, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 60 }, { x: 40, y: 60 }] },
          words: [{ symbols: [{ text: "H" }, { text: "i", property: { detectedBreak: { type: "LINE_BREAK" } } }] }],
        }] }],
      }],
    },
  }],
});
assert.deepEqual({ ...googleUnits[0], box_2d: [...googleUnits[0].box_2d] }, { id: 1, text: "Hi", box_2d: [100, 100, 300, 500] });

const azureUnits = imageApi.parseOcrResponse("azure", {
  metadata: { width: 1000, height: 500 },
  readResult: {
    blocks: [{
      lines: [
        { text: "おはよう", boundingPolygon: [{ x: 100, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 100 }, { x: 100, y: 100 }] },
        { text: "SONY", boundingPolygon: [{ x: 800, y: 400 }, { x: 900, y: 400 }, { x: 900, y: 450 }, { x: 800, y: 450 }] },
      ],
    }],
  },
});
const ocrResult = imageApi.parseOcrImageTranslation(
  JSON.stringify({ has_text: true, regions: [{ ids: [1], translation: "早安" }, { ids: [2], translation: "SONY" }] }),
  azureUnits,
);
assert.equal(ocrResult.regions.length, 1);
assert.equal(ocrResult.regions[0].source, "おはよう");
assert.equal(ocrResult.translation, "[1] 早安");

context.atob = (b64) => Buffer.from(b64, "base64").toString("binary");
const sampleImage = { mimeType: "image/jpeg", base64: "aGVsbG8=", byteLength: 5 };
const ocrReq = imageApi.requestOcr(sampleImage, { provider: "google", apiKey: "g-key" });
const beforeOcrRetry = transport.history.length;
transport.options.onload({ status: 429, responseHeaders: "Retry-After: 0", responseText: '{"error":{"message":"Rate limit"}}' });
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(transport.history.length, beforeOcrRetry + 1);
transport.options.onload({ status: 200, responseText: JSON.stringify({ responses: [{}] }) });
assert.equal((await ocrReq.promise).length, 0);

// 3. Transport request + Gemini generic INVALID_ARGUMENT schema fallback.
const nativeImageReq = imageApi.requestImageTranslation(sampleImage, {
  ...cacheSettings, apiFormat: "gemini-native", baseURL: googleBaseURL, model: "gemini-3.5-flash-lite", apiKey: "test",
});
transport.options.onload({ status: 400, responseText: JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "Invalid argument" } }) });
assert.equal(JSON.parse(transport.options.data).generationConfig.responseJsonSchema, undefined);
transport.options.onload({
  status: 200,
  responseText: JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ has_text: true, regions: [{ box_2d: [100, 100, 300, 900], translation: "圖片翻譯" }] }) }] } }] }),
});
assert.equal((await nativeImageReq.promise).regions[0].translation, "圖片翻譯");

// 4. Layout box math & image scaling/compression.
assert.deepEqual({ ...imageApi.imageContentBox(1000, 500, 400, 400, "contain") }, { left: 0, top: 100, width: 400, height: 200 });
assert.deepEqual({ ...imageApi.imageContentBox(1000, 500, 300, 300, "cover") }, { left: -150, top: 0, width: 600, height: 300 });
const stacked = imageApi.computeRegionBoxLayout(400, 300, [{ box_2d: [100, 200, 180, 450] }, { box_2d: [110, 205, 190, 460] }]);
assert.ok(stacked[1].labelY >= stacked[0].labelY + stacked[0].labelHeight);
assert.deepEqual({ ...imageApi.normalizedImageDimensions(1080, 5400) }, { width: 640, height: 3200 });

context.btoa = (bin) => Buffer.from(bin, "binary").toString("base64");
const origCreateElement = document.createElement;
let canvasAlpha = 255;
document.createElement = (tag) => tag === "canvas" ? {
  getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, canvasAlpha]) }) }),
  toDataURL: (type) => `data:${type};base64,iVBORw0KGgo=`,
} : createMockDom(tag);
const compressed = await imageApi.extractNormalizedImage({ currentSrc: "https://example.com/shot.png", complete: true, naturalWidth: 2000, naturalHeight: 2000 });
assert.equal(compressed.mimeType, "image/jpeg");
assert.equal(compressed.width, 1600);

// 5. DOM mock for hit-testing, two-finger swipe gestures, and full-screen viewer.
function createMockDom(tagName) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = new Map();
  const el = {
    tagName: String(tagName || "DIV").toUpperCase(),
    children: [], dataset: {}, hidden: false, isConnected: true, open: false,
    parentElement: null, nextElementSibling: null, previousElementSibling: null, textContent: "",
    style: { props: new Map(), setProperty(k, v) { this.props.set(k, v); }, removeProperty(k) { this.props.delete(k); } },
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
    set className(val) { classes.clear(); String(val || "").split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    get className() { return [...classes].join(" "); },
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k === "class") this.className = v;
      if (k.startsWith("data-")) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    },
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute(k) {
      attrs.delete(k);
      if (k.startsWith("data-")) delete this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    },
    showModal() { this.open = true; },
    close() { this.open = false; },
    append(...nodes) {
      for (const n of nodes) if (n && typeof n === "object") { n.parentElement = el; n.isConnected = true; el.children.push(n); }
    },
    prepend(...nodes) {
      for (const n of nodes.reverse()) if (n && typeof n === "object") { n.parentElement = el; n.isConnected = true; el.children.unshift(n); }
    },
    replaceChildren(...nodes) { el.children = []; el.append(...nodes); },
    remove() {
      el.isConnected = false; el.open = false;
      const idx = el.parentElement?.children?.indexOf(el) ?? -1;
      if (idx !== -1) el.parentElement.children.splice(idx, 1);
      el.parentElement = null;
    },
    addEventListener: (type, fn) => listeners.set(type, fn),
    dispatch: (type, ev) => listeners.get(type)?.(ev),
    dispatchClick: () => listeners.get("click")?.({ preventDefault() {}, stopPropagation() {} }),
    querySelector: (sel) => el.querySelectorAll(sel)[0] || null,
    querySelectorAll(sel) {
      const out = [];
      const attrMatch = /^\[([a-z0-9-]+)(?:="([^"]*)")?\]$/i.exec(sel);
      const match = (node) => {
        if (sel.startsWith(".")) return node.classList?.contains?.(sel.slice(1));
        if (attrMatch) {
          const [, name, expected] = attrMatch;
          const val = node.getAttribute?.(name) ?? (name.startsWith("data-")
            ? node.dataset?.[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]
            : undefined);
          return expected === undefined ? val != null : val === expected;
        }
        return node.tagName?.toLowerCase() === sel.toLowerCase();
      };
      const walk = (n) => { for (const c of n.children || []) { if (match(c)) out.push(c); walk(c); } };
      walk(el);
      return out;
    },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 240 }),
  };
  if (el.tagName === "IMG") Object.assign(el, { complete: true, naturalWidth: 640, naturalHeight: 480 });
  return el;
}

document.createElementNS = (_ns, tag) => createMockDom(tag);
document.body.append = (...nodes) => nodes.forEach((n) => { if (n && typeof n === "object") n.isConnected = true; });
context.getComputedStyle = (element) => ({
  backdropFilter: element?.backdropFilter || "none",
  display: element?.display || "block",
  backgroundColor: element?.backgroundColor || "rgba(0, 0, 0, 0)",
  backgroundImage: element?.backgroundImage || "none",
  opacity: element?.opacity ?? "1",
  visibility: element?.visibility || "visible",
});

const container = createMockDom("div");
const mockImg = Object.assign(createMockDom("img"), {
  currentSrc: "https://example.com/panel.png",
  getClientRects: () => [{}],
  closest: () => null,
  insertAdjacentElement(_pos, el) { el.parentElement = container; el.isConnected = true; container.children.unshift(el); },
});
container.append(mockImg);
assert.equal(imageApi.isTranslatableImage(mockImg), true);

// Sheer overlay link pierces to image; blur blocks.
const coverLink = Object.assign(createMockDom("a"), {
  className: "stretched-link", closest: () => null,
  backgroundColor: "rgba(0, 0, 0, 0.02)",
  backgroundImage: "linear-gradient(to top, rgba(0, 0, 0, 0.35), transparent)",
});
container.append(coverLink);
document.elementsFromPoint = () => [coverLink, mockImg, container];
assert.equal(imageApi.resolveTargetImage(coverLink, { clientX: 80, clientY: 90 }), mockImg);
coverLink.backdropFilter = "blur(12px)";
assert.equal(imageApi.resolveTargetImage(coverLink, { clientX: 80, clientY: 90 }), null);
delete document.elementsFromPoint;

// Viewer lifecycle: Spotlight, zoom, pull-down close, and source-change reset.
let resizeDisconnects = 0;
context.ResizeObserver = class {
  observe() {}
  disconnect() { resizeDisconnects += 1; }
};
const state = imageApi.ensureImageOverlay(mockImg);
const dialog = imageApi.openImageViewer(mockImg, merged);
assert.equal(dialog.open, true);
assert.equal(state.button.dataset.state, "done");
const stage = dialog.querySelector(".touch-image-translate__viewer-stage");
const canvas = dialog.querySelector(".touch-image-translate__viewer-canvas");
for (let tap = 0; tap < 2; tap += 1) {
  stage.dispatch("touchstart", { touches: [{ clientX: 60, clientY: 50 }] });
  stage.dispatch("touchend", { touches: [] });
}
assert.doesNotMatch(canvas.style.props.get("transform"), /^translate3d\(0px, 0px/);
dialog.querySelector('[data-action="reset-zoom"]').dispatchClick();
stage.dispatch("touchstart", { touches: [{ clientX: 160, clientY: 60 }] });
stage.dispatch("touchmove", { cancelable: true, preventDefault() {}, touches: [{ clientX: 162, clientY: 165 }] });
stage.dispatch("touchend", { touches: [], changedTouches: [{ clientX: 162, clientY: 165 }] });
assert.equal(dialog.isConnected, false);
assert.equal(resizeDisconnects, 1);

// Two-finger right swipe triggers gesture while single-finger swipe is ignored.
let prevented = false;
imageApi.onTouchStart({ target: mockImg, touches: [{ identifier: 1, clientX: 40, clientY: 80, target: mockImg }] });
imageApi.onTouchMove({ cancelable: true, preventDefault() { prevented = true; }, touches: [{ identifier: 1, clientX: 120, clientY: 80, target: mockImg }] });
imageApi.onTouchEnd({ cancelable: true, changedTouches: [{ identifier: 1, clientX: 120, clientY: 80, target: mockImg }], touches: [] });
assert.equal(prevented, false);

imageApi.onTouchStart({
  target: mockImg,
  touches: [{ identifier: 1, clientX: 50, clientY: 230, target: mockImg }, { identifier: 2, clientX: 55, clientY: 272, target: container }],
});
imageApi.onTouchMove({
  cancelable: true, preventDefault() { prevented = true; },
  touches: [{ identifier: 1, clientX: 125, clientY: 230, target: mockImg }, { identifier: 2, clientX: 130, clientY: 272, target: container }],
});
assert.equal(prevented, true);
assert.equal(state.button.dataset.state, "gesture");
imageApi.resetTouches();

// Source change resets stale results and aborts in-flight jobs.
mockImg.currentSrc = "https://example.com/replacement.png";
imageApi.syncImageOverlay(mockImg);
assert.equal(state.result, null);
assert.equal(state.button.dataset.state, "idle");

document.createElement = origCreateElement;
delete context.ResizeObserver;
