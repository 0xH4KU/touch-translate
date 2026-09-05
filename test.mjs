import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("./touch-translate.user.js", import.meta.url),
  "utf8",
);
const api = {};
const body = {};
const documentElement = {};
const NodeFilter = {
  FILTER_ACCEPT: 1,
  FILTER_REJECT: 2,
  SHOW_TEXT: 4,
};
const document = {
  body,
  documentElement,
  createTreeWalker(element, _whatToShow, filter) {
    const nodes = (element.textNodes || []).filter(
      (node) => filter.acceptNode(node) === NodeFilter.FILTER_ACCEPT,
    );
    let index = -1;
    return {
      currentNode: null,
      nextNode() {
        this.currentNode = nodes[++index];
        return Boolean(this.currentNode);
      },
    };
  },
};
let requestAborted = false;
let requestOptions;
const requestHistory = [];
const context = vm.createContext({
  __TOUCH_TRANSLATE_TEST__: api,
  URL,
  clearTimeout,
  console,
  document,
  NodeFilter,
  setTimeout,
  GM_xmlhttpRequest: (options) => {
    requestOptions = options;
    requestHistory.push(options);
    return {
      abort() {
        requestAborted = true;
        options.onabort();
      },
    };
  },
  getComputedStyle: (element) => ({
    contentVisibility: element.contentVisibility,
    direction: element.direction,
    display: element.display,
    overflowX: element.overflowX,
    visibility: element.visibility,
  }),
  matchMedia: () => ({ matches: true }),
});
vm.runInContext(source, context);

assert.match(source, /opacity: 0\.78 !important;/);
assert.doesNotMatch(source, /drop-shadow/);
assert.doesNotMatch(source, /touch-translate-pulse/);
assert.match(
  source,
  /data-state="loading"\]::before[\s\S]{0,300}inset: 5\.5px[\s\S]{0,200}animation: touch-translate-breathe/,
);
assert.match(
  source,
  /data-state="loading"\]::after[\s\S]{0,200}inset: 0 !important;[\s\S]{0,200}border: 1px solid currentColor[\s\S]{0,200}animation: touch-translate-loading-ring/,
);
assert.doesNotMatch(source, /touch-translate-ripple/);
assert.match(
  source,
  /@keyframes touch-translate-commit\s*\{\s*from \{ opacity: 0\.32; \}\s*to \{ opacity: 0\.82; \}/,
);
assert.doesNotMatch(source, /touch-translate-spin/);
assert.doesNotMatch(source, /touch-action: pan-y/);
assert.match(
  source,
  /if \(gesture\.phase === "possible"\) \{\s*gesture\.phase = swipeIntent\(dx, touch\.clientY - gesture\.y\);/,
);
assert.match(
  source,
  /data-state="error"\]::before[\s\S]{0,240}background: #c8453c/,
);
assert.match(
  source,
  /if \(indicator\.parentElement !== element\) element\.append\(indicator\)/,
);
assert.doesNotMatch(source, /indicatorPosition/);
assert.match(
  source,
  /state === "loading" && indicator\?\.dataset\.state !== "loading"[\s\S]{0,80}removeIndicator\(element\)/,
);
assert.doesNotMatch(source, /indicator\.addEventListener\("click"/);
assert.match(source, /document\.createElement\("dialog"\)/);
assert.match(source, /field\(\s*"API Key",\s*"apiKey",\s*"password"/);
assert.doesNotMatch(source, /\bprompt\(/);
assert.match(source, /GM_deleteValue\(SETTINGS_KEY\)/);
assert.match(source, /translateElements\(elements\)\.catch\(reportError\)/);
assert.doesNotMatch(source, /\\00d7/);
assert.match(
  source,
  /data-action="remove"\][\s\S]{0,500}width: 8px !important;[\s\S]{0,200}linear-gradient\(45deg/,
);
assert.match(source, /new MutationObserver\(task\.refresh\)/);
assert.match(source, /attributes: true,[\s\S]{0,300}"hidden"/);
assert.equal(api.normalizeText("  hello\n  world "), "hello world");
assert.equal(api.pageTextLooksUseful("https://example.com/path"), false);
assert.equal(api.pageTextLooksUseful("2026-08-29"), false);
assert.equal(api.pageTextLooksUseful("A useful sentence."), true);
assert.equal(
  api.errorMessageFor({ message: "The requested model does not exist." }),
  "The requested model does not exist.",
);
assert.equal(
  api.structuredOutputUnsupported(
    400,
    "response_format json_schema is not supported",
  ),
  true,
);
assert.equal(api.structuredOutputUnsupported(401, "response_format"), false);
assert.match(api.oversizedBlocksError([6001]).message, /6001[\s\S]*6000/);
assert.equal(
  api.endpointFor("https://api.example.com/v1/"),
  "https://api.example.com/v1/chat/completions",
);
assert.deepEqual(
  [
    ...api.parseTranslations(
      '```json\n{"translations":["one","two"]}\n```',
      2,
    ),
  ],
  ["one", "two"],
);
assert.throws(
  () => api.parseTranslations("not json", 1),
  /Response format mismatch[\s\S]*AI output:\nnot json/,
);
assert.throws(
  () => api.parseTranslations('{"translations":["one"]}', 2),
  /Expected 2 translations, received 1/,
);
const inline = api.parseInlineTranslation(
  "[[TT0]]A translated lead[[/TT0]] [[TT1]]a colored quote[[/TT1]]",
  2,
);
assert.equal(inline.translation, "A translated lead a colored quote");
assert.deepEqual([...inline.segments], [
  "A translated lead",
  "a colored quote",
]);
assert.equal(
  api.parseInlineTranslation(
    "[[TT0]]A translated lead[[/TT0]] [[TT1]]a broken quote",
    2,
  ).segments,
  null,
);
assert.throws(
  () => api.cleanSettings({ baseURL: "http://example.com", model: "m" }),
  /HTTPS/,
);
assert.equal(api.isPrivateOrLocalHost("localhost"), true);
assert.equal(api.isPrivateOrLocalHost("127.0.0.1"), true);
assert.equal(api.isPrivateOrLocalHost("::1"), true);
assert.equal(api.isPrivateOrLocalHost("192.168.1.10"), true);
assert.equal(api.isPrivateOrLocalHost("10.0.0.2"), true);
assert.equal(api.isPrivateOrLocalHost("172.24.0.1"), true);
assert.equal(api.isPrivateOrLocalHost("nas.local"), true);
assert.equal(api.isPrivateOrLocalHost("router.lan"), true);
assert.equal(api.isPrivateOrLocalHost("cluster.internal"), true);
assert.equal(api.isPrivateOrLocalHost("gateway.home.arpa"), true);
assert.equal(api.isPrivateOrLocalHost("example.com"), false);
assert.equal(api.isPrivateOrLocalHost("172.35.0.1"), false);
assert.equal(api.isPrivateOrLocalHost("8.8.8.8"), false);
assert.equal(
  api.cleanSettings({ baseURL: "http://192.168.1.100:11434", model: "m" }).baseURL,
  "http://192.168.1.100:11434",
);
assert.equal(
  api.cleanSettings({ baseURL: "http://ollama.local:11434", model: "m" }).baseURL,
  "http://ollama.local:11434",
);
assert.equal(
  api.cleanSettings({ baseURL: "https://api.openai.com/v1", model: "m" }).temperature,
  0.2,
);
assert.equal(
  api.cleanSettings({ baseURL: "https://api.openai.com/v1", model: "m", temperature: "0.65" }).temperature,
  0.65,
);
assert.throws(
  () => api.cleanSettings({ baseURL: "https://api.openai.com/v1", model: "m", temperature: "2.5" }),
  /Temperature/,
);
assert.equal(
  api.retryDelayFor({ responseHeaders: "Retry-After: 60" }, 0),
  60000,
);
const retryAt = new Date(Date.now() + 60000).toUTCString();
const retryAtDelay = api.retryDelayFor(
  { responseHeaders: `Retry-After: ${retryAt}` },
  0,
);
assert.ok(retryAtDelay >= 58000 && retryAtDelay <= 60000);
const cacheSettings = {
  baseURL: "https://api.example.com/v1",
  model: "m",
  targetLanguage: "zh-TW",
};
assert.equal(
  api.hashCacheKey("same", cacheSettings),
  api.hashCacheKey("same", cacheSettings),
);
assert.notEqual(
  api.hashCacheKey("same", { ...cacheSettings, temperature: 0.2 }),
  api.hashCacheKey("same", { ...cacheSettings, temperature: 2 }),
);

const records = [
  { text: "a".repeat(4000) },
  { text: "b".repeat(2500) },
  { text: "c" },
];
assert.deepEqual(
  [...api.makeBatches(records)].map((batch) => batch.length),
  [1, 2],
);
assert.deepEqual(
  [...api.makeBatches(Array(8).fill({ text: "x".repeat(500) }), true)].map(
    (batch) => batch.length,
  ),
  [3, 5],
);

const grouped = api.groupRecords([
  { key: "same", text: "Repeated text", element: 1 },
  { key: "same", text: "Repeated text", element: 2 },
  { key: "other", text: "Other text", element: 3 },
]);
assert.deepEqual(
  [...grouped].map((group) => [group.key, group.entries.length]),
  [
    ["same", 2],
    ["other", 1],
  ],
);
assert.deepEqual(
  [...api.viewportPriority({ top: 20, bottom: 100 }, 800)],
  [0, 20],
);
assert.deepEqual(
  [...api.viewportPriority({ top: 900, bottom: 980 }, 800)],
  [1, 100],
);
assert.equal(api.isNearViewport({ top: 1500, bottom: 1580 }, 800), true);
assert.equal(api.isNearViewport({ top: 1700, bottom: 1780 }, 800), false);
assert.ok(
  api.compareViewportPriority(
    { top: 20, bottom: 100 },
    { top: -500, bottom: -400 },
    800,
  ) < 0,
);

const pageBlock = {
  classList: { contains: () => false },
  closest: () => null,
  display: "block",
  getClientRects: () => [{}],
  innerText: "A useful heading",
  isConnected: true,
  matches: () => true,
  nextElementSibling: null,
  querySelector: () => null,
  visibility: "visible",
};
const pageRoot = { contains: (element) => element === pageBlock };
assert.equal(api.isTranslatablePageBlock(pageBlock, [pageRoot]), true);
pageBlock.querySelector = () => ({});
assert.equal(api.isTranslatablePageBlock(pageBlock, [pageRoot]), false);
pageBlock.querySelector = () => null;
pageBlock.visibility = "hidden";
assert.equal(api.isTranslatablePageBlock(pageBlock, [pageRoot]), false);

const visibleRoot = {
  closest: () => null,
  display: "block",
  innerText: "Visible text",
  matches: () => false,
  parentElement: null,
  visibility: "visible",
};
const visibleNode = {
  nodeValue: "Visible text",
  parentElement: visibleRoot,
};
const hiddenParent = {
  closest: () => null,
  display: "none",
  matches: () => false,
  parentElement: visibleRoot,
  visibility: "visible",
};
const hiddenNode = { nodeValue: "Hidden text", parentElement: hiddenParent };
visibleRoot.textNodes = [visibleNode, hiddenNode];
assert.equal(api.isRenderedTextNode(visibleNode, visibleRoot), true);
assert.equal(api.isRenderedTextNode(hiddenNode, visibleRoot), false);
assert.equal(api.sourceText({ innerText: "", textContent: "Hidden text" }), "");
let removedTranslations = 0;
const translatedElement = {
  isConnected: true,
  remove() {
    this.isConnected = false;
    removedTranslations += 1;
  },
};
const pageTask = { translations: new Set([translatedElement]) };
api.undoPageTranslations(pageTask);
assert.equal(removedTranslations, 1);
assert.equal(pageTask.translations.size, 0);
const snapshotSettings = {
  baseURL: "https://api.example.com/v1",
  model: "m",
  targetLanguage: "zh-TW",
};
const sourceRecord = {
  element: visibleRoot,
  formatKey: api.hashCacheKey("Visible text", snapshotSettings),
  text: "Visible text",
};
assert.equal(api.recordMatchesElement(sourceRecord, snapshotSettings), true);
visibleRoot.innerText = "Updated text";
visibleNode.nodeValue = "Updated text";
assert.equal(api.recordMatchesElement(sourceRecord, snapshotSettings), false);

const touch = { identifier: 7, clientX: 40, clientY: 30 };
const touchList = { 0: touch, length: 1 };
assert.equal(api.pointFor(touchList, 7), touch);
assert.equal(
  api.movedTooFar(touchList, new Map([[7, { x: 0, y: 0 }]])),
  true,
);
assert.equal(api.indicatorFor(null), null);
assert.equal(api.projectedSwipeX(30, 0.4), 66);
assert.equal(api.swipeVelocity([{ x: 10, at: 0 }, { x: 50, at: 100 }]), 0.4);
assert.equal(api.swipeIntent(10, 12), "possible");
assert.equal(api.swipeIntent(16, 12), "horizontal");
assert.equal(api.swipeIntent(16, 16), "horizontal");
assert.equal(api.swipeIntent(10, 24), "cancel");
assert.equal(api.swipeIntent(-16, 0), "cancel");
assert.equal(api.swipeShouldCommit(60, -0.2), true);
assert.equal(api.swipeShouldCommit(30, 0.4), true);
assert.equal(api.swipeShouldCommit(20, 0.8), false);
assert.equal(api.swipeShouldCommit(30, -0.2, true), true);
assert.equal(api.swipeShouldCommit(20, 0.8, true), false);

const request = api.requestTranslations(["hello"], {
  apiKey: "test",
  baseURL: "https://api.example.com/v1",
  model: "fast-model",
  targetLanguage: "zh-TW",
});
request.abort();
await assert.rejects(request.promise, (error) => error.name === "AbortError");
assert.equal(requestAborted, true);
const successfulRequest = api.requestTranslations(["hello"], {
  apiKey: "test",
  baseURL: "https://api.example.com/v1",
  model: "fast-model",
  targetLanguage: "zh-TW",
});
const requestBody = JSON.parse(requestOptions.data);
assert.equal(requestBody.response_format.type, "json_schema");
assert.equal(requestBody.temperature, 0.2);
assert.match(
  requestBody.messages[0].content,
  /naturally into zh-TW[\s\S]*Do not add explanations or commentary[\s\S]*If paired \[\[TT0\]\]/,
);
assert.doesNotMatch(source, /prompt-v1/);
assert.equal(
  requestBody.response_format.json_schema.schema.properties.translations.minItems,
  1,
);
assert.equal(
  requestBody.response_format.json_schema.schema.properties.translations.maxItems,
  1,
);
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: '{"translations":["hello translated"]}',
        },
      },
    ],
  }),
});
assert.deepEqual([...(await successfulRequest.promise)], ["hello translated"]);

const fallbackSettings = {
  apiKey: "test",
  baseURL: "https://api.example.com/v1",
  model: "fallback-model",
  targetLanguage: "zh-TW",
};
const fallbackRequest = api.requestTranslations(["hello"], fallbackSettings);
requestOptions.onload({
  status: 400,
  responseText: JSON.stringify({
    error: { message: "response_format json_schema is not supported" },
  }),
});
assert.equal(JSON.parse(requestOptions.data).response_format, undefined);
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [
      {
        finish_reason: "stop",
        message: { content: '{"translations":["fallback translated"]}' },
      },
    ],
  }),
});
assert.deepEqual([...(await fallbackRequest.promise)], ["fallback translated"]);

const rememberedFallback = api.requestTranslations(
  ["again"],
  fallbackSettings,
);
assert.equal(JSON.parse(requestOptions.data).response_format, undefined);
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [
      {
        finish_reason: "stop",
        message: { content: '{"translations":["again translated"]}' },
      },
    ],
  }),
});
assert.deepEqual([...(await rememberedFallback.promise)], ["again translated"]);

const retrySettings = {
  apiKey: "test",
  baseURL: "https://api.example.com/v1",
  model: "retry-model",
  targetLanguage: "zh-TW",
};
const requestsBeforeRetry = requestHistory.length;
const retryPromise = api.requestTranslations(["retry block"], retrySettings);
assert.equal(requestHistory.length, requestsBeforeRetry + 1);
requestOptions.onload({
  status: 429,
  responseHeaders: "Retry-After: 0",
  responseText: JSON.stringify({
    error: { message: "Rate limit reached for requests" },
  }),
});
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(requestHistory.length, requestsBeforeRetry + 2);
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [
      {
        finish_reason: "stop",
        message: { content: '{"translations":["retry translated"]}' },
      },
    ],
  }),
});
assert.deepEqual([...(await retryPromise.promise)], ["retry translated"]);

const quotaPromise = api.requestTranslations(["quota block"], retrySettings);
requestOptions.onload({
  status: 429,
  responseText: JSON.stringify({
    error: { message: "You exceeded your current quota" },
  }),
});
await assert.rejects(quotaPromise.promise, /quota/i);

const outerListItem = {
  display: "list-item",
  innerText: "A generic text block and its metadata",
  matches: (selector) => selector.includes("li"),
  parentElement: body,
};
const genericBlock = {
  closest: () => outerListItem,
  display: "flow-root",
  innerText: "A generic text block",
  matches: () => false,
  parentElement: outerListItem,
};
const inlineText = {
  closest: (selector) =>
    selector === ".touch-translate__translation" ? null : outerListItem,
  display: "inline",
  innerText: "A generic text block",
  matches: () => false,
  parentElement: genericBlock,
};
assert.equal(api.swipeElementFor(inlineText), genericBlock);

const largerParent = {
  display: "block",
  innerText: "A and unrelated surrounding text",
  matches: () => false,
  parentElement: body,
};
const shortBlock = {
  closest: () => null,
  display: "block",
  innerText: "A",
  matches: () => false,
  parentElement: largerParent,
};
assert.equal(api.swipeElementFor(shortBlock), shortBlock);

const citationButton = {
  children: [],
  display: "block",
  innerText: "Citation metadata",
  matches: (selector) => selector.includes("button"),
};
const citedBlock = {
  children: [citationButton],
  closest: () => null,
  display: "block",
  innerText: "A sentence with citation metadata",
  matches: () => false,
  parentElement: body,
};
assert.equal(api.swipeElementFor(citedBlock), citedBlock);

const citation = {
  children: [],
  display: "block",
  innerText: "Kyoko Sakura, Episode 7",
  matches: () => false,
};
const quotedParagraph = {
  children: [citation],
  closest: () => null,
  display: "block",
  innerText: "Miracles aren't free. Kyoko Sakura, Episode 7",
  matches: (selector) => selector.includes("p"),
  parentElement: body,
};
assert.equal(api.swipeElementFor(quotedParagraph), quotedParagraph);

const nestedTextBlock = {
  children: [],
  display: "block",
  innerText: "The intended paragraph",
  matches: () => false,
};
const broadContainer = {
  children: [nestedTextBlock],
  closest: () => null,
  display: "block",
  innerText: "The intended paragraph and unrelated content",
  matches: () => false,
  parentElement: body,
};
assert.equal(api.swipeElementFor(broadContainer), null);

const scrollContainer = {
  clientWidth: 320,
  direction: "ltr",
  overflowX: "auto",
  parentElement: body,
  scrollLeft: 80,
  scrollWidth: 640,
};
const tableCell = { parentElement: scrollContainer };
assert.equal(api.canConsumeRightSwipe(tableCell), true);
scrollContainer.scrollLeft = 0;
assert.equal(api.canConsumeRightSwipe(tableCell), false);

Object.assign(scrollContainer, { direction: "rtl", scrollLeft: -80 });
assert.equal(api.canConsumeRightSwipe(tableCell), true);
scrollContainer.scrollLeft = 0;
assert.equal(api.canConsumeRightSwipe(tableCell), false);

Object.assign(documentElement, {
  clientWidth: 320,
  direction: "ltr",
  overflowX: "auto",
  scrollLeft: 80,
  scrollWidth: 640,
});
document.scrollingElement = documentElement;
const pageContent = { parentElement: documentElement };
assert.equal(api.canConsumeRightSwipe(pageContent), false);

const slottedTitle = {
  closest: () => null,
  display: "block",
  innerText: "Slotted headline",
  matches: (selector) => selector.includes("[slot='title']"),
  parentElement: body,
};
assert.equal(api.swipeElementFor(slottedTitle), slottedTitle);

const shadowHost = {
  closest: () => null,
  display: "block",
  innerText: "Shadow host block text",
  matches: (selector) => selector.includes("p"),
  parentElement: body,
};
const shadowChild = {
  closest: () => null,
  display: "inline",
  getRootNode: () => ({ host: shadowHost }),
  innerText: "Shadow child text",
  matches: () => false,
  parentElement: null,
};
assert.equal(api.swipeElementFor(shadowChild), shadowHost);

const underlyingText = {
  innerText: "Underlying post title",
  matches: () => false,
};
const overlayLink = {
  innerText: "Accessible screen reader text",
  matches: (selector) => selector.includes("stretched-link"),
  tagName: "A",
};
document.elementsFromPoint = () => [overlayLink, underlyingText, body];
assert.equal(
  api.resolveTargetElement(overlayLink, { clientX: 50, clientY: 50 }),
  underlyingText,
);

console.log("Touch Translate self-check passed");
