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
let requestAborted = false;
let requestOptions;
const context = vm.createContext({
  __TOUCH_TRANSLATE_TEST__: api,
  URL,
  console,
  document: { body, documentElement },
  GM_xmlhttpRequest: (options) => {
    requestOptions = options;
    return {
      abort() {
        requestAborted = true;
        options.onabort();
      },
    };
  },
  getComputedStyle: (element) => ({
    display: element.display,
    overflowX: element.overflowX,
  }),
});
vm.runInContext(source, context);

assert.match(source, /opacity: 0\.78 !important;/);
assert.match(source, /state === "loading" \? element : document\.documentElement/);
assert.match(
  source,
  /state === "loading" && indicator\?\.dataset\.state !== "loading"[\s\S]{0,80}removeIndicator\(element\)/,
);
assert.match(source, /font: 700 11px\/16px/);
assert.match(source, /new MutationObserver\(task\.refresh\)/);
assert.equal(api.errorHitSize, 44);
assert.equal(api.normalizeText("  hello\n  world "), "hello world");
assert.equal(api.pageTextLooksUseful("https://example.com/path"), false);
assert.equal(api.pageTextLooksUseful("2026-08-29"), false);
assert.equal(api.pageTextLooksUseful("A useful sentence."), true);
assert.equal(
  api.errorMessageFor({ message: "The requested model does not exist." }),
  "The requested model does not exist.",
);
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
assert.equal(
  api.hashCacheKey("same", {
    baseURL: "https://api.example.com/v1",
    model: "m",
    targetLanguage: "zh-TW",
  }),
  api.hashCacheKey("same", {
    baseURL: "https://api.example.com/v1",
    model: "m",
    targetLanguage: "zh-TW",
  }),
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

const touch = { identifier: 7, clientX: 40, clientY: 30 };
const touchList = { 0: touch, length: 1 };
assert.equal(api.pointFor(touchList, 7), touch);
assert.equal(
  api.movedTooFar(touchList, new Map([[7, { x: 0, y: 0 }]])),
  true,
);
assert.equal(api.indicatorFor(null), null);
const position = api.indicatorPosition(
  { x: 385, y: 20 },
  null,
  { width: 390, height: 844, scrollX: 0, scrollY: 100 },
);
assert.deepEqual(
  { ...position },
  { left: 368, top: 122 },
);
assert.equal(api.projectedSwipeX(30, 0.4), 66);
assert.equal(api.swipeVelocity([{ x: 10, at: 0 }, { x: 50, at: 100 }]), 0.4);
assert.equal(api.swipeShouldCommit(60, 0, 500), true);
assert.equal(api.swipeShouldCommit(30, 0, 300, 0.4), true);
assert.equal(api.swipeShouldCommit(20, 0, 300, 0.8), false);
assert.equal(api.swipeShouldCommit(70, 0, 300, -0.2), false);
assert.equal(api.swipeShouldCommit(70, 43, 300), false);
assert.equal(api.swipeShouldCommit(70, 0, 1201), false);

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
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [{ message: { content: '["hello translated"]' } }],
  }),
});
assert.deepEqual([...(await successfulRequest.promise)], ["hello translated"]);

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
  overflowX: "auto",
  parentElement: body,
  scrollWidth: 640,
};
const tableCell = { parentElement: scrollContainer };
assert.equal(api.hasHorizontalScroller(tableCell), true);
scrollContainer.scrollWidth = 320;
assert.equal(api.hasHorizontalScroller(tableCell), false);

console.log("Touch Translate self-check passed");
