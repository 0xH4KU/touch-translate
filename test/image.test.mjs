import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHarness, cacheSettings, googleBaseURL, customGatewayBaseURL } from "./fixtures.mjs";

const { api, imageApi, source, imageSource, context, document, body, documentElement, transport } = createHarness();

// Standalone Touch Image Translate userscript tests
assert.match(imageSource, /@name\s+Touch Image Translate/);
assert.doesNotMatch(imageSource, /innerHTML/);
assert.doesNotMatch(imageSource, /drop-shadow/);
assert.doesNotMatch(imageSource, /prompt-v[123]\b/);


// Settings interoperability between Touch Translate and Touch Image Translate
const ttExportedPayload = {
  version: 1,
  exportedAt: "2026-10-18T00:00:00.000Z",
  settings: {
    apiFormat: "gemini-native",
    baseURL: "https://gateway.ai.cloudflare.com/v1/acc/gw/google-ai-studio",
    model: "google-ai-studio/gemini-3.1-flash-lite",
    targetLanguage: "Traditional Chinese",
    thinkingLevel: "medium",
    apiKey: "cf-token-123",
  },
};
const importedFromTT = imageApi.parseImportedSettings(ttExportedPayload);
assert.deepEqual(
  { ...importedFromTT },
  { ...api.cleanSettings(ttExportedPayload.settings) },
);
assert.equal(
  imageApi.endpointFor(
    importedFromTT.baseURL,
    importedFromTT.model,
    importedFromTT.apiFormat,
  ),
  api.endpointFor(
    importedFromTT.baseURL,
    importedFromTT.model,
    importedFromTT.apiFormat,
  ),
);
const importedFlat = imageApi.parseImportedSettings(ttExportedPayload.settings);
assert.deepEqual({ ...importedFlat }, { ...importedFromTT });
assert.throws(
  () => imageApi.parseImportedSettings({ version: 2 }),
  /Unsupported settings file format/,
);

// Image translation: region normalization and structured output parsing
const normalizedRegion = imageApi.normalizeImageRegion({
  box_2d: [100, 200, 300, 800],
  translation: "  第一句  ",
});
assert.deepEqual([...normalizedRegion.box_2d], [100, 200, 300, 800]);
assert.equal(normalizedRegion.translation, "第一句");
assert.equal(imageApi.normalizeImageRegion([50, 120, 250, 640]), null);
assert.equal(
  imageApi.normalizeImageRegion({ box_2d: [300, 200, 100, 800], translation: "bad y" }),
  null,
);
assert.equal(
  imageApi.normalizeImageRegion({ box_2d: [100, 800, 300, 200], translation: "bad x" }),
  null,
);
assert.equal(
  imageApi.normalizeImageRegion({ box_2d: [-1, 0, 100, 100], translation: "neg" }),
  null,
);
assert.equal(
  imageApi.normalizeImageRegion({ box_2d: [0, 0, 1001, 100], translation: "over" }),
  null,
);

const parsedImage = imageApi.parseImageTranslation(
  '```json\n{"has_text":true,"regions":[{"box_2d":[100,150,240,850],"translation":"歡迎光臨"},{"box_2d":[400,150,550,850],"translation":"今日特餐"}]}\n```',
);
assert.equal(parsedImage.hasText, true);
assert.equal(parsedImage.regions.length, 2);
assert.deepEqual([...parsedImage.regions[0].box_2d], [100, 150, 240, 850]);
assert.equal(parsedImage.regions[0].translation, "歡迎光臨");
assert.equal(parsedImage.translation, "[1] 歡迎光臨\n\n[2] 今日特餐");

// Macro-block merging for dense text (> 5 vertically close, aligned regions)
const denseJson = JSON.stringify({
  has_text: true,
  regions: [
    { box_2d: [100, 100, 140, 800], translation: "第一段第一行" },
    { box_2d: [148, 100, 188, 800], translation: "第一段第二行" },
    { box_2d: [195, 100, 235, 780], translation: "第一段第三行" },
    { box_2d: [400, 100, 440, 800], translation: "第二段第一行" },
    { box_2d: [448, 100, 488, 790], translation: "第二段第二行" },
    { box_2d: [800, 200, 860, 700], translation: "底部獨立標題" },
  ],
});
const mergedDense = imageApi.parseImageTranslation(denseJson);
assert.equal(mergedDense.regions.length, 3);
assert.deepEqual([...mergedDense.regions[0].box_2d], [100, 100, 235, 800]);
assert.equal(
  mergedDense.regions[0].translation,
  "第一段第一行\n第一段第二行\n第一段第三行",
);
assert.deepEqual([...mergedDense.regions[1].box_2d], [400, 100, 488, 800]);
assert.equal(mergedDense.regions[1].translation, "第二段第一行\n第二段第二行");
assert.equal(mergedDense.regions[2].translation, "底部獨立標題");

const synthesizedImage = imageApi.parseImageTranslation(
  '{"has_text":true,"regions":[{"box_2d":[50.4,49.8,200.2,500],"translation":"自動編號一"},{"box_2d":[300,50,450,500],"translation":"自動編號二"}]}',
);
assert.equal(synthesizedImage.hasText, true);
assert.deepEqual([...synthesizedImage.regions[0].box_2d], [50, 50, 200, 500]);
assert.equal(synthesizedImage.translation, "[1] 自動編號一\n\n[2] 自動編號二");

const invalidBoxImage = {
  has_text: true,
  regions: [
    { box_2d: [100, 100, 200, 400], translation: "第一區譯文" },
    { box_2d: [300, 100, 300, 400], translation: "第二區譯文" },
  ],
};
for (const box of [[300, 100, 300, 400], [-1, 100, 200, 400], [300, 100, 400]]) {
  assert.throws(
    () =>
      imageApi.parseImageTranslation(
        JSON.stringify({
          ...invalidBoxImage,
          regions: [
            invalidBoxImage.regions[0],
            { ...invalidBoxImage.regions[1], box_2d: box },
          ],
        }),
      ),
    /Response format mismatch/,
  );
}
assert.throws(
  () => imageApi.parseImageTranslation('{"has_text":true,"regions":[{"box_2d":[100,100,100,400],"translation":""}]}'),
  /Response format mismatch/,
);

// Separate blocks with different widths or larger gaps stay distinct even when > 5 regions
const separateBlocksJson = JSON.stringify({
  has_text: true,
  regions: [
    { box_2d: [50, 100, 90, 320], translation: "短標題" },
    { box_2d: [105, 100, 150, 820], translation: "下方較寬的內文區塊" },
    { box_2d: [190, 100, 240, 820], translation: "間距較大的下一個獨立對話框" },
    { box_2d: [300, 100, 350, 500], translation: "區塊四" },
    { box_2d: [420, 100, 470, 500], translation: "區塊五" },
    { box_2d: [540, 100, 590, 500], translation: "區塊六" },
  ],
});
assert.equal(imageApi.parseImageTranslation(separateBlocksJson).regions.length, 6);

// Noise filtering removes UI status bars, handles, URLs, and tiny watermark specks,
// and macro-block merging also works when <= 5 regions remain.
const noisyScreenshotJson = JSON.stringify({
  has_text: true,
  regions: [
    { box_2d: [10, 20, 32, 95], translation: "9:41 AM" },
    { box_2d: [10, 880, 32, 960], translation: "100%" },
    { box_2d: [80, 100, 115, 280], translation: "@author_handle" },
    { box_2d: [140, 100, 180, 800], translation: "貼文主體第一行內容" },
    { box_2d: [186, 100, 226, 790], translation: "貼文主體緊鄰的第二行內容" },
    { box_2d: [860, 100, 895, 240], translation: "12.5K" },
    { box_2d: [910, 100, 940, 500], translation: "https://example.com/post" },
    { box_2d: [980, 900, 985, 970], translation: "微小浮水印" },
  ],
});
const cleanedScreenshot = imageApi.parseImageTranslation(noisyScreenshotJson);
assert.equal(cleanedScreenshot.hasText, true);
assert.equal(cleanedScreenshot.regions.length, 1);
assert.deepEqual([...cleanedScreenshot.regions[0].box_2d], [140, 100, 226, 800]);
assert.equal(
  cleanedScreenshot.regions[0].translation,
  "貼文主體第一行內容\n貼文主體緊鄰的第二行內容",
);
assert.equal(
  cleanedScreenshot.translation,
  "[1] 貼文主體第一行內容\n貼文主體緊鄰的第二行內容",
);

const onlyNoiseJson = JSON.stringify({
  has_text: true,
  regions: [
    { box_2d: [10, 20, 30, 80], translation: "9:41" },
    { box_2d: [50, 60, 80, 200], translation: "@username" },
  ],
});
const emptyAfterFilter = imageApi.parseImageTranslation(onlyNoiseJson);
assert.equal(emptyAfterFilter.hasText, false);
assert.equal(emptyAfterFilter.regions.length, 0);
assert.equal(emptyAfterFilter.translation, "");

const noTextImage = imageApi.parseImageTranslation(
  '{"has_text":false,"regions":[]}',
);
assert.equal(noTextImage.hasText, false);
assert.equal(noTextImage.translation, "");
assert.equal(noTextImage.regions.length, 0);

assert.throws(() => imageApi.parseImageTranslation(""), /The AI output was empty/);
assert.throws(() => imageApi.parseImageTranslation("not json"), /Response format mismatch/);

const shortLineBox = [107, 104, 786, 855];

// Image content box and Spotlight SVG region layout
context.getComputedStyle = (element) => ({
  contentVisibility: element?.contentVisibility,
  direction: element?.direction,
  display: element?.display || "block",
  backgroundColor: element?.backgroundColor || "rgba(0, 0, 0, 0)",
  backgroundImage: element?.backgroundImage || "none",
  opacity: element?.opacity ?? "1",
  objectFit: element?.objectFit || "fill",
  objectPosition: element?.objectPosition || "50% 50%",
  overflowX: element?.overflowX,
  visibility: element?.visibility || "visible",
});
const containBox = imageApi.imageContentBox(1000, 500, 400, 400, "contain");
assert.deepEqual({ ...containBox }, { left: 0, top: 100, width: 400, height: 200 });
const coverBox = imageApi.imageContentBox(1000, 500, 300, 300, "cover");
assert.deepEqual({ ...coverBox }, { left: -150, top: 0, width: 600, height: 300 });
const croppedRegion = imageApi.computeRegionBoxLayout(coverBox.width, coverBox.height, [
  { box_2d: [200, 400, 400, 600] },
])[0];
assert.equal(coverBox.left + croppedRegion.x, 90);
assert.equal(croppedRegion.boxWidth, 120);
assert.equal(imageApi.imageContentBox(1000, 500, 300, 300, "cover", "100% 0%").left, -300);
assert.equal(imageApi.imageContentBox(1000, 500, 400, 400, "contain", "0% calc(100% - 10px)").top, 190);
assert.equal(imageApi.imageContentBox(1000, 500, 400, 400, "contain", "top").top, 0);
assert.deepEqual(
  { ...imageApi.imageContentBox(1000, 500, 300, 300, "none", "25% 50%") },
  { left: -175, top: -100, width: 1000, height: 500 },
);

const layoutItems = imageApi.computeRegionBoxLayout(400, 200, parsedImage.regions);
assert.equal(layoutItems.length, 2);
assert.equal(layoutItems[0].label, "1");
assert.equal(layoutItems[0].x, 60);
assert.equal(layoutItems[0].y, 20);
assert.equal(layoutItems[0].boxWidth, 280);
assert.equal(layoutItems[0].boxHeight, 28);
const subpixelItem = imageApi.computeRegionBoxLayout(333, 250, [
  { box_2d: [125, 123, 375, 456] },
])[0];
assert.equal(subpixelItem.x, 40.96);
assert.equal(subpixelItem.y, 31.25);

// Image eligibility & anchor resolution
const eligibleImg = {
  complete: true,
  currentSrc: "https://example.com/manga.jpg",
  display: "block",
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 240 }),
  getClientRects: () => [{}],
  isConnected: true,
  naturalWidth: 800,
  naturalHeight: 600,
  tagName: "IMG",
  visibility: "visible",
  closest: () => null,
};
assert.equal(imageApi.isTranslatableImage(eligibleImg), true);
assert.equal(
  imageApi.isTranslatableImage({
    ...eligibleImg,
    currentSrc: "data:image/svg+xml;base64,PHN2Zz4=",
  }),
  false,
);
assert.equal(
  imageApi.isTranslatableImage({
    ...eligibleImg,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 80, height: 80 }),
  }),
  false,
);

const singleImageLink = {
  tagName: "A",
  innerText: "",
  parentElement: body,
};
const pictureWrapper = {
  tagName: "PICTURE",
  parentElement: singleImageLink,
  closest: (sel) => (sel === "a" ? singleImageLink : null),
};
assert.equal(
  imageApi.imageAnchor({
    ...eligibleImg,
    closest: (sel) => (sel === "picture" ? pictureWrapper : null),
  }),
  singleImageLink,
);

// Image translation transport: Chat Completions and Gemini (native)
const sampleImageData = {
  mimeType: "image/jpeg",
  base64: "aGVsbG8=",
  byteLength: 5,
};
for (const native of [false, true]) {
  const imageSettings = {
    ...cacheSettings,
    baseURL: native ? googleBaseURL : cacheSettings.baseURL,
    model: "vision-model",
    apiKey: "test",
    apiFormat: native ? "gemini-native" : "chat-completions",
  };
  const imgReq = imageApi.requestImageTranslation({
    ...sampleImageData,
  }, imageSettings);
  const sentBody = JSON.parse(transport.options.data);
  if (native) {
    assert.equal(sentBody.generationConfig.responseMimeType, "application/json");
    assert.equal(
      sentBody.generationConfig.responseJsonSchema.properties.has_text.type,
      "boolean",
    );
    assert.deepEqual(
      sentBody.generationConfig.responseJsonSchema.properties.regions.items.required,
      ["box_2d", "translation"],
    );
    assert.equal(sentBody.contents[0].parts[1].inlineData.mimeType, "image/jpeg");
    assert.equal(sentBody.contents[0].parts[1].inlineData.data, "aGVsbG8=");
  } else {
    assert.equal(sentBody.response_format.type, "json_schema");
    assert.equal(
      sentBody.response_format.json_schema.name,
      "babel_lens_translation",
    );
    assert.deepEqual(
      sentBody.response_format.json_schema.schema.properties.regions.items.required,
      ["box_2d", "translation"],
    );
    assert.equal(
      sentBody.messages[1].content[1].image_url.url,
      "data:image/jpeg;base64,aGVsbG8=",
    );
  }
  const modelJson = JSON.stringify({
    has_text: true,
    regions: [{ box_2d: shortLineBox, translation: "圖片翻譯測試" }],
  });
  transport.options.onload({
    status: 200,
    responseText: JSON.stringify(
      native
        ? { candidates: [{ finishReason: "STOP", content: { parts: [{ text: modelJson }] } }] }
        : { choices: [{ finish_reason: "stop", message: { content: modelJson } }] },
    ),
  });
  const res = await imgReq.promise;
  assert.equal(res.hasText, true);
  assert.equal(res.regions.length, 1);
  assert.equal(res.regions[0].translation, "圖片翻譯測試");
  assert.deepEqual([...res.regions[0].box_2d], shortLineBox);
}

// Gemini can reject an image schema with only a generic INVALID_ARGUMENT error.
const visionSettings = {
  ...cacheSettings,
  apiFormat: "gemini-native",
  baseURL: customGatewayBaseURL,
  model: "gemini-3.5-flash-lite",
  apiKey: "test",
};
const nativeImageResponse = JSON.stringify({
  candidates: [
    {
      finishReason: "STOP",
      content: {
        parts: [
          {
            text: JSON.stringify({
              has_text: true,
              regions: [{ box_2d: [100, 100, 300, 900], translation: "圖片翻譯" }],
            }),
          },
        ],
      },
    },
  ],
});
const imageFallback = imageApi.requestImageTranslation(sampleImageData, visionSettings);
const schemaBody = JSON.parse(transport.options.data);
const fallbackCount = transport.history.length;
transport.options.onload({
  status: 400,
  responseText: JSON.stringify({
    error: {
      code: 400,
      status: "INVALID_ARGUMENT",
      message: "Request contains an invalid argument.",
    },
  }),
});
const jsonBody = JSON.parse(transport.options.data);
assert.equal(transport.history.length, fallbackCount + 1);
assert.equal(jsonBody.generationConfig.responseJsonSchema, undefined);
assert.equal(jsonBody.generationConfig.responseMimeType, "application/json");
delete schemaBody.generationConfig.responseJsonSchema;
assert.deepEqual(jsonBody, schemaBody);
transport.options.onload({ status: 200, responseText: nativeImageResponse });
assert.equal((await imageFallback.promise).regions[0].translation, "圖片翻譯");

// Provider diagnostics must not expose URL credentials, query keys, or API keys.
for (const native of [false, true]) {
  const diagnosticSettings = {
    ...cacheSettings,
    apiFormat: native ? "gemini-native" : "chat-completions",
    baseURL: "https://url-user:url-password@ai.example.com/google-ai-studio?key=query-secret#fragment-secret",
    model: "redaction-model",
    apiKey: "diagnostic-api-secret",
  };
  const request = imageApi.requestImageTranslation(sampleImageData, diagnosticSettings);
  const sentURL = new URL(transport.options.url);
  transport.options.onload({ status: 401, responseText: JSON.stringify({ error: {
    message: `Unauthorized diagnostic-api-secret at ${transport.options.url}`,
  } }) });
  await assert.rejects(request.promise, (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(error.message.includes(`${sentURL.origin}${sentURL.pathname}`));
    assert.doesNotMatch(error.message, /url-user|url-password|query-secret|fragment-secret|diagnostic-api-secret/);
    return true;
  });
}

// Malformed responses and transport errors share the same redaction boundary.
const diagnosticImageSettings = {
  ...cacheSettings,
  apiKey: "diagnostic-api-secret",
  baseURL: "https://url-user:url-password@ai.example.com/v1?key=query-secret#fragment-secret",
};
const malformedProviderResult = imageApi.requestImageTranslation(sampleImageData, diagnosticImageSettings);
for (let attempt = 0; attempt < 2; attempt += 1) {
  transport.options.onload({ status: 200, responseText: JSON.stringify({ choices: [{
    message: { content: `invalid-json diagnostic-api-secret ${transport.options.url}` },
  }] }) });
}
await assert.rejects(malformedProviderResult.promise, (error) => {
  assert.equal(error.code, "TRANSLATION_RESPONSE_ERROR");
  assert.doesNotMatch(error.message, /url-user|url-password|query-secret|fragment-secret|diagnostic-api-secret/);
  return true;
});
const imageTransportBeforeFailure = context.GM_xmlhttpRequest;
context.GM_xmlhttpRequest = (options) => {
  throw Object.assign(new Error(`Transport failed: ${options.url} diagnostic-api-secret`), {
    name: "NetworkError",
    code: "TEST_NETWORK_FAILURE",
  });
};
try {
  const failedTransport = imageApi.requestImageTranslation(sampleImageData, diagnosticImageSettings);
  await assert.rejects(failedTransport.promise, (error) => {
    assert.equal(error.name, "NetworkError");
    assert.equal(error.code, "TEST_NETWORK_FAILURE");
    assert.doesNotMatch(error.message, /url-user|url-password|query-secret|fragment-secret|diagnostic-api-secret/);
    return true;
  });
} finally {
  context.GM_xmlhttpRequest = imageTransportBeforeFailure;
}

// Full-screen Zoomable Image Viewer, Spotlight Mode, and lifecycle
function createMockDomElement(tagName) {
  const attrs = new Map();
  const classes = new Set();
  const listeners = new Map();
  return {
    tagName: String(tagName || "DIV").toUpperCase(),
    children: [],
    dataset: {},
    hidden: false,
    isConnected: true,
    nextElementSibling: null,
    parentElement: null,
    open: false,
    style: {
      props: new Map(),
      setProperty(k, v) {
        this.props.set(k, v);
      },
      removeProperty(k) {
        this.props.delete(k);
      },
    },
    textContent: "",
    classList: {
      add(c) {
        classes.add(c);
      },
      contains(c) {
        return classes.has(c);
      },
    },
    set className(val) {
      classes.clear();
      String(val || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach((c) => classes.add(c));
    },
    get className() {
      return [...classes].join(" ");
    },
    setAttribute(k, v) {
      attrs.set(k, String(v));
      if (k === "class") this.className = v;
      if (k.startsWith("data-")) {
        const prop = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[prop] = String(v);
      }
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    removeAttribute(k) {
      attrs.delete(k);
      if (k.startsWith("data-")) {
        const prop = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        delete this.dataset[prop];
      }
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    append(...nodes) {
      for (const n of nodes) {
        if (n && typeof n === "object") {
          n.parentElement = this;
          n.isConnected = true;
          this.children.push(n);
        }
      }
    },
    prepend(...nodes) {
      for (const n of nodes.reverse()) {
        if (n && typeof n === "object") {
          n.parentElement = this;
          n.isConnected = true;
          this.children.unshift(n);
        }
      }
    },
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    },
    remove() {
      this.isConnected = false;
      this.open = false;
      if (this.previousElementSibling) {
        this.previousElementSibling.nextElementSibling = this.nextElementSibling;
      }
      if (this.nextElementSibling) {
        this.nextElementSibling.previousElementSibling = this.previousElementSibling;
      }
      if (this.parentElement?.children) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) this.parentElement.children.splice(idx, 1);
      }
      this.parentElement = null;
      this.previousElementSibling = null;
      this.nextElementSibling = null;
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    dispatchClick() {
      listeners.get("click")?.({
        preventDefault() {},
        stopPropagation() {},
      });
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const results = [];
      const attrMatch = /^\[([a-z0-9-]+)(?:="([^"]*)")?\]$/i.exec(selector);
      const matchNode = (node) => {
        if (selector.startsWith(".")) {
          return node.classList?.contains?.(selector.slice(1));
        }
        if (attrMatch) {
          const [, attrName, attrVal] = attrMatch;
          const val =
            node.getAttribute?.(attrName) ??
            (attrName.startsWith("data-")
              ? node.dataset?.[
                  attrName.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
                ]
              : undefined);
          return attrVal === undefined ? val !== null && val !== undefined : val === attrVal;
        }
        return node.tagName?.toLowerCase() === selector.toLowerCase();
      };
      const walk = (node) => {
        for (const child of node.children || []) {
          if (matchNode(child)) results.push(child);
          walk(child);
        }
      };
      walk(this);
      return results;
    },
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 320, height: 240 }),
  };
}

document.createElement = (tag) => {
  const element = createMockDomElement(tag);
  if (tag === "img") {
    Object.assign(element, { complete: true, naturalWidth: 640, naturalHeight: 480 });
  }
  return element;
};
document.createElementNS = (_ns, tag) => createMockDomElement(tag);
document.createTextNode = (text) => ({ nodeValue: text, textContent: text });
document.createDocumentFragment = () => createMockDomElement("fragment");
document.body.append = (...nodes) => {
  for (const n of nodes) {
    if (n && typeof n === "object") {
      n.isConnected = true;
    }
  }
};

const mockContainer = createMockDomElement("div");
const mockImg = Object.assign(createMockDomElement("img"), {
  complete: true,
  currentSrc: "https://example.com/panel.png",
  display: "block",
  visibility: "visible",
  naturalWidth: 640,
  naturalHeight: 480,
  getClientRects: () => [{}],
  closest: () => null,
  insertAdjacentElement(position, element) {
    element.parentElement = mockContainer;
    element.isConnected = true;
    const index = mockContainer.children.indexOf(this);
    if (position === "beforebegin") {
      element.previousElementSibling = this.previousElementSibling;
      if (this.previousElementSibling) {
        this.previousElementSibling.nextElementSibling = element;
      }
      this.previousElementSibling = element;
      element.nextElementSibling = this;
      mockContainer.children.splice(index, 0, element);
    }
  },
});
mockContainer.append(mockImg);

const overlayState = imageApi.ensureImageOverlay(mockImg);
assert.ok(overlayState);
assert.equal(overlayState.button.dataset.state, "idle");
// Idle images must hide both button and overlay so browsing has zero visual obstruction
assert.equal(overlayState.button.hidden, true);
assert.equal(overlayState.overlay.hidden, true);

// Right-swipe helpers and overlay-penetrating target resolution
assert.equal(imageApi.swipeIntent(24, 4), "horizontal");
assert.equal(imageApi.swipeIntent(-20, 2), "cancel");
assert.equal(imageApi.swipeIntent(4, 30), "cancel");
assert.equal(imageApi.swipeShouldCommit(60, 0, false), true);
assert.equal(imageApi.swipeShouldCommit(30, 0.5, false), true);
assert.equal(imageApi.swipeShouldCommit(20, 0, false), false);
assert.equal(imageApi.resolveTargetImage(mockImg, { clientX: 50, clientY: 60 }), mockImg);

const imageOverlayLink = createMockDomElement("a");
imageOverlayLink.className = "stretched-link";
imageOverlayLink.closest = () => null;
mockContainer.append(imageOverlayLink);
document.elementsFromPoint = (x, y) =>
  x === 80 && y === 90 ? [imageOverlayLink, mockImg, mockContainer] : [];
assert.equal(
  imageApi.resolveTargetImage(imageOverlayLink, { clientX: 80, clientY: 90 }),
  mockImg,
);
imageOverlayLink.backgroundColor = "rgb(255, 255, 255)";
imageOverlayLink.backgroundImage = `url("${mockImg.currentSrc}")`;
assert.equal(
  imageApi.resolveTargetImage(imageOverlayLink, { clientX: 80, clientY: 90 }),
  mockImg,
);
delete imageOverlayLink.backgroundImage;
delete imageOverlayLink.backgroundColor;

// A sibling image with pointer-events:none is absent from the hit-test stack.
document.elementsFromPoint = () => [imageOverlayLink, mockContainer];
assert.equal(
  imageApi.resolveTargetImage(imageOverlayLink, { clientX: 80, clientY: 90 }),
  mockImg,
);
const opaqueImageCover = createMockDomElement("div");
opaqueImageCover.closest = () => null;
opaqueImageCover.backgroundColor = "rgb(255, 255, 255)";
mockContainer.append(opaqueImageCover);
document.elementsFromPoint = () => [opaqueImageCover, imageOverlayLink, mockImg, mockContainer];
assert.equal(
  imageApi.resolveTargetImage(opaqueImageCover, { clientX: 80, clientY: 90 }),
  null,
);
opaqueImageCover.backgroundColor = "rgba(0, 0, 0, 0)";
opaqueImageCover.textContent = "Foreground notice";
assert.equal(
  imageApi.resolveTargetImage(opaqueImageCover, { clientX: 80, clientY: 90 }),
  null,
);
// Even a direct picture ancestor must not bypass the foreground-cover check.
opaqueImageCover.closest = (selector) => selector === "picture" ? mockContainer : null;
assert.equal(
  imageApi.resolveTargetImage(opaqueImageCover, { clientX: 80, clientY: 90 }),
  null,
);
opaqueImageCover.remove();
const imageShadowHost = createMockDomElement("div");
imageShadowHost.backgroundColor = "rgb(255, 255, 255)";
imageShadowHost.parentElement = document.body;
mockContainer.getRootNode = () => ({ host: imageShadowHost });
document.elementsFromPoint = () => [imageShadowHost];
assert.equal(
  imageApi.resolveTargetImage(imageOverlayLink, { clientX: 80, clientY: 90 }),
  mockImg,
);
const shadowCover = createMockDomElement("div");
shadowCover.closest = () => null;
shadowCover.backgroundColor = "rgb(255, 255, 255)";
mockContainer.append(shadowCover);
assert.equal(
  imageApi.resolveTargetImage(shadowCover, { clientX: 80, clientY: 90 }),
  null,
);
shadowCover.remove();
delete mockContainer.getRootNode;
const unrelatedOverlayLink = createMockDomElement("a");
unrelatedOverlayLink.closest = () => null;
unrelatedOverlayLink.parentElement = document.body;
document.elementsFromPoint = () => [unrelatedOverlayLink, mockImg, mockContainer];
assert.equal(
  imageApi.resolveTargetImage(unrelatedOverlayLink, { clientX: 80, clientY: 90 }),
  null,
);
delete document.elementsFromPoint;

// Opening the full-screen viewer sets button state to done (visible) and highlights region 1 in Spotlight Mode
let viewerResize;
let resizeDisconnects = 0;
context.ResizeObserver = class {
  constructor(callback) { viewerResize = callback; }
  observe() {}
  disconnect() { resizeDisconnects += 1; }
};
const viewerDialog = imageApi.openImageViewer(mockImg, parsedImage);
assert.ok(viewerDialog);
assert.equal(viewerDialog.open, true);
assert.equal(overlayState.button.dataset.state, "done");
assert.equal(overlayState.button.hidden, false);
assert.equal(overlayState.overlay.hidden, false);
// In-page thumbnail overlay must NOT contain SVG region boxes (clutter-free thumbnail)
assert.equal(
  overlayState.overlay.querySelectorAll(".touch-image-translate__region").length,
  0,
);

assert.equal(
  viewerDialog.querySelector(".touch-image-translate__regions").getAttribute("viewBox"),
  "0 0 320 240",
);
const viewerImage = viewerDialog.querySelector(".touch-image-translate__viewer-img");
viewerImage.clientWidth = 240;
viewerImage.clientHeight = 180;
viewerImage.getBoundingClientRect = () => ({ left: 10, top: 20, width: 240, height: 180 });
viewerResize();
const regionGroups = viewerDialog.querySelectorAll(".touch-image-translate__region");
const translationItems = viewerDialog.querySelectorAll(".touch-image-translate__item");
assert.equal(regionGroups.length, 2);
assert.equal(translationItems.length, 2);
assert.equal(
  viewerDialog.querySelector(".touch-image-translate__regions").getAttribute("viewBox"),
  "0 0 240 180",
);
const pinRects = regionGroups[0].querySelectorAll("rect");
assert.equal(Number(pinRects[1].getAttribute("height")), 28);
assert.equal(Number(pinRects[2].getAttribute("width")), 44);
assert.equal(Number(pinRects[2].getAttribute("height")), 44);
const zoomStage = viewerDialog.querySelector(".touch-image-translate__viewer-stage");
for (let tap = 0; tap < 2; tap += 1) {
  zoomStage.dispatch("touchstart", { touches: [{ clientX: 100, clientY: 100 }] });
  zoomStage.dispatch("touchend", { touches: [] });
}
const pinGroup = regionGroups[0].querySelector("[data-pin-x]");
assert.ok(pinGroup.getAttribute("transform").includes(`scale(${1 / 2.4})`));
viewerDialog.querySelector('[data-action="reset-zoom"]').dispatchClick();
assert.match(pinGroup.getAttribute("transform"), /scale\(1\)/);

// Region 1 is active by default in Spotlight Mode
assert.equal(regionGroups[0].getAttribute("data-active"), "true");
assert.equal(regionGroups[1].getAttribute("data-active"), null);
assert.equal(
  regionGroups[0].querySelectorAll("rect")[0].getAttribute("stroke-opacity"),
  "0.95",
);
assert.equal(
  regionGroups[1].querySelectorAll("rect")[0].getAttribute("stroke-opacity"),
  "0",
);

// Click region 2 -> switches spotlight to region 2
regionGroups[1].dispatchClick();
assert.equal(regionGroups[0].getAttribute("data-active"), null);
assert.equal(regionGroups[1].getAttribute("data-active"), "true");
assert.equal(translationItems[1].getAttribute("data-active"), "true");
assert.equal(
  regionGroups[1].querySelectorAll("rect")[0].getAttribute("stroke-opacity"),
  "0.95",
);
assert.equal(
  regionGroups[0].querySelectorAll("rect")[0].getAttribute("stroke-opacity"),
  "0",
);

// Toggle pins button hides/shows pins on the viewer
const togglePinsBtn = viewerDialog.querySelector('[data-action="toggle-pins"]');
togglePinsBtn.dispatchClick();
assert.equal(viewerDialog.getAttribute("data-hide-pins"), "true");
togglePinsBtn.dispatchClick();
assert.equal(viewerDialog.getAttribute("data-hide-pins"), null);

// Expand button reveals full region list
const expandBtn = viewerDialog.querySelector('[data-action="toggle-expand"]');
const viewerList = viewerDialog.querySelector(".touch-image-translate__viewer-list");
assert.equal(viewerList.hidden, true);
expandBtn.dispatchClick();
assert.equal(viewerList.hidden, false);

// Closing viewer keeps state="done" so a two-finger right-swipe (or tapping the done badge) re-opens the viewer immediately
imageApi.closeImageViewer();
assert.equal(viewerDialog.isConnected, false);
assert.equal(resizeDisconnects, 1);
assert.equal(overlayState.button.dataset.state, "done");

// Single-finger right-swipe is ignored so social media image carousels never conflict
let prevented = false;
imageApi.onTouchStart({
  target: mockImg,
  touches: [{ identifier: 1, clientX: 40, clientY: 80, target: mockImg }],
});
imageApi.onTouchMove({
  cancelable: true,
  preventDefault() { prevented = true; },
  touches: [{ identifier: 1, clientX: 120, clientY: 80, target: mockImg }],
});
imageApi.onTouchEnd({
  cancelable: true,
  changedTouches: [{ identifier: 1, clientX: 120, clientY: 80, target: mockImg }],
  touches: [],
});
assert.equal(prevented, false);
assert.equal(overlayState.button.dataset.state, "done");

// Two-finger pinch-out (opposite horizontal movement) is cancelled
imageApi.onTouchStart({
  target: mockImg,
  touches: [
    { identifier: 1, clientX: 80, clientY: 80, target: mockImg },
    { identifier: 2, clientX: 120, clientY: 80, target: mockImg },
  ],
});
imageApi.onTouchMove({
  cancelable: true,
  preventDefault() { prevented = true; },
  touches: [
    { identifier: 1, clientX: 50, clientY: 80, target: mockImg },
    { identifier: 2, clientX: 160, clientY: 80, target: mockImg },
  ],
});
imageApi.resetTouches();
assert.equal(prevented, false);

// Staggered two-finger right-swipe (1->2 touchstart, 2->1->0 touchend) triggers image action
imageApi.onTouchStart({
  target: mockImg,
  touches: [{ identifier: 1, clientX: 40, clientY: 70, target: mockImg }],
});
imageApi.onTouchStart({
  target: mockImg,
  touches: [
    { identifier: 1, clientX: 42, clientY: 70, target: mockImg },
    { identifier: 2, clientX: 45, clientY: 110, target: mockImg },
  ],
});
let gesturePrevented = false;
imageApi.onGesture({
  cancelable: true,
  preventDefault() { gesturePrevented = true; },
});
assert.equal(gesturePrevented, true);
imageApi.onTouchMove({
  cancelable: true,
  preventDefault() { prevented = true; },
  touches: [
    { identifier: 1, clientX: 46, clientY: 70, target: mockImg },
    { identifier: 2, clientX: 49, clientY: 110, target: mockImg },
  ],
});
assert.equal(prevented, true);
prevented = false;
imageApi.onTouchMove({
  cancelable: true,
  preventDefault() { prevented = true; },
  touches: [
    { identifier: 1, clientX: 110, clientY: 72, target: mockImg },
    { identifier: 2, clientX: 115, clientY: 112, target: mockImg },
  ],
});
assert.equal(prevented, true);
assert.equal(overlayState.button.dataset.state, "gesture");
imageApi.onTouchEnd({
  cancelable: true,
  changedTouches: [{ identifier: 1, clientX: 110, clientY: 72, target: mockImg }],
  touches: [{ identifier: 2, clientX: 115, clientY: 112, target: mockImg }],
});
imageApi.onTouchEnd({
  cancelable: true,
  changedTouches: [{ identifier: 2, clientX: 115, clientY: 112, target: mockImg }],
  touches: [],
});

imageApi.closeImageViewer();
assert.equal(resizeDisconnects, 2);

// Source changes clear completed results, close any open viewer, and hide the idle button again
const reopenedDialog = imageApi.handleImageSwipe(mockImg);
assert.equal(reopenedDialog.open, true);
mockImg.currentSrc = "https://example.com/replacement.png";
imageApi.syncImageOverlay(mockImg);
assert.equal(reopenedDialog.isConnected, false);
assert.equal(overlayState.button.dataset.state, "idle");
assert.equal(overlayState.button.hidden, true);
assert.equal(overlayState.overlay.hidden, true);
assert.equal(overlayState.result, null);
assert.equal(resizeDisconnects, 3);
delete context.ResizeObserver;

// Ignore an old response even if it arrives before the source-change observer runs.
context.GM_getValue = (key, fallback) =>
  key === "settings-v1" ? { ...cacheSettings, apiKey: "test" } : fallback;
context.GM_setValue = () => {};
for (const observeBeforeReply of [false, true]) {
  mockImg.currentSrc = "data:image/png;base64,iVBORw0KGgo=";
  imageApi.syncImageOverlay(mockImg);
  transport.aborted = false;
  const pendingImage = imageApi.translateImage(mockImg);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const oldRequest = transport.options;
  assert.equal(oldRequest.method, "POST");
  mockImg.currentSrc = "data:image/png;base64,aGVsbG8=";
  if (observeBeforeReply) {
    imageApi.syncImageOverlay(mockImg);
    assert.equal(transport.aborted, true);
  } else {
    oldRequest.onload({
      status: 200,
      responseText: JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                has_text: true,
                regions: [{ box_2d: [100, 100, 300, 900], translation: "舊圖片的譯文" }],
              }),
            },
          },
        ],
      }),
    });
  }
  assert.equal(await pendingImage, null);
  assert.equal(overlayState.button.dataset.state, "idle");
  assert.equal(mockImg.getAttribute("aria-busy"), null);
}

// extractNormalizedImage: data URL, binary ArrayBuffer, and PNG transparency preservation
context.btoa = (bin) => Buffer.from(bin, "binary").toString("base64");
const dataUrlExtracted = await imageApi.extractNormalizedImage({
  currentSrc: "data:image/png;base64,iVBORw0KGgo=",
});
assert.equal(dataUrlExtracted.mimeType, "image/png");
assert.equal(dataUrlExtracted.base64, "iVBORw0KGgo=");

const createElementBeforeCanvas = document.createElement;
let encodedImageType;
document.createElement = (tag) =>
  tag === "canvas"
    ? {
        getContext: () => ({ drawImage() {} }),
        toDataURL(type) {
          encodedImageType = type;
          return `data:${type};base64,iVBORw0KGgo=`;
        },
      }
    : createElementBeforeCanvas(tag);
const resizedImage = await imageApi.extractNormalizedImage({
  currentSrc: "data:image/png;base64,iVBORw0KGgo=",
  complete: true,
  naturalWidth: 2000,
  naturalHeight: 500,
});
assert.equal(encodedImageType, "image/png");
assert.equal(resizedImage.width, 1600);
assert.equal(resizedImage.height, 400);
document.createElement = createElementBeforeCanvas;

// Frontend DOM assembly in insertTranslation preserves safe links, colors, and target word order
function makeRichMockElement(tagName, attrMap = {}, display = "inline") {
  const store = new Map(Object.entries(attrMap));
  const classes = new Set(
    String(attrMap.class || "")
      .split(/\s+/)
      .filter(Boolean),
  );
  return {
    tagName: tagName.toUpperCase(),
    display,
    visibility: "visible",
    isConnected: true,
    parentElement: null,
    nextElementSibling: null,
    children: [],
    textNodes: [],
    style: { cssText: attrMap.style || "", setProperty() {}, removeProperty() {} },
    classList: {
      add: (c) => classes.add(c),
      contains: (c) => classes.has(c),
    },
    get attributes() {
      return [...store.keys()].map((name) => ({ name }));
    },
    getAttribute: (name) => (store.has(name) ? store.get(name) : null),
    setAttribute: (name, val) => store.set(name, String(val)),
    removeAttribute: (name) => store.delete(name),
    matches: () => false,
    querySelectorAll(sel) {
      if (sel.includes("script")) return [];
      const all = [];
      const walk = (el) => {
        for (const ch of el.children || []) {
          if (ch && typeof ch === "object" && ch.tagName) {
            all.push(ch);
            walk(ch);
          }
        }
      };
      walk(this);
      return all;
    },
    append(...items) {
      for (const item of items) {
        if (item && typeof item === "object") item.parentElement = this;
        this.children.push(item);
      }
    },
    replaceChildren(...items) {
      this.children = [];
      this.append(...items);
    },
    cloneNode(deep = false) {
      const copyAttrs = Object.fromEntries(store.entries());
      const copy = makeRichMockElement(this.tagName, copyAttrs, this.display);
      if (deep) {
        const clonedMap = new Map([[this, copy]]);
        for (const ch of this.children) {
          const chCopy = ch.cloneNode(true);
          chCopy.parentElement = copy;
          copy.children.push(chCopy);
          clonedMap.set(ch, chCopy);
        }
        copy.textNodes = this.textNodes.map((tn) => ({
          ...tn,
          parentElement: clonedMap.get(tn.parentElement) || copy,
        }));
      }
      return copy;
    },
    insertAdjacentElement(_pos, el) {
      this.nextElementSibling = el;
      el.isConnected = true;
    },
  };
}

const sourcePara = makeRichMockElement("p", {}, "block");
const safeLink = makeRichMockElement("a", {
  href: "https://example.com/guide",
  target: "_blank",
  onclick: "evil()",
});
const coloredSpan = makeRichMockElement("span", {
  style: "color: rgb(225, 29, 72)",
  class: "highlight-author",
});
const unsafeLink = makeRichMockElement("a", {
  href: "javascript:alert(1)",
});
sourcePara.append(safeLink, coloredSpan, unsafeLink);
sourcePara.textNodes = [
  { nodeValue: "Read ", parentElement: sourcePara },
  { nodeValue: "this guide", parentElement: safeLink },
  { nodeValue: " by ", parentElement: sourcePara },
  { nodeValue: "Alice", parentElement: coloredSpan },
  { nodeValue: " or ", parentElement: sourcePara },
  { nodeValue: "click", parentElement: unsafeLink },
  { nodeValue: ".", parentElement: sourcePara },
];
const parsedRich = api.parseInlineTranslation(
  "閱讀 <1>愛麗絲</1> 撰寫的<0>這份指南</0>或<2>點擊</2>。",
  3,
);
api.insertTranslation(sourcePara, parsedRich);
const insertedPara = sourcePara.nextElementSibling;
assert.ok(insertedPara);
assert.equal(insertedPara.children.length, 7);
assert.equal(insertedPara.children[0], "閱讀 ");
assert.equal(insertedPara.children[1].tagName, "SPAN");
assert.equal(insertedPara.children[1].getAttribute("style"), "color: rgb(225, 29, 72)");
assert.equal(insertedPara.children[1].getAttribute("class"), "highlight-author");
assert.deepEqual(insertedPara.children[1].children, ["愛麗絲"]);
assert.equal(insertedPara.children[2], " 撰寫的");
assert.equal(insertedPara.children[3].tagName, "A");
assert.equal(insertedPara.children[3].getAttribute("href"), "https://example.com/guide");
assert.equal(insertedPara.children[3].getAttribute("target"), "_blank");
assert.equal(insertedPara.children[3].getAttribute("rel"), "noopener noreferrer");
assert.equal(insertedPara.children[3].getAttribute("onclick"), null);
assert.deepEqual(insertedPara.children[3].children, ["這份指南"]);
assert.equal(insertedPara.children[4], "或");
assert.equal(insertedPara.children[5].tagName, "A");
assert.equal(insertedPara.children[5].getAttribute("href"), null);
assert.deepEqual(insertedPara.children[5].children, ["點擊"]);
assert.equal(insertedPara.children[6], "。");


