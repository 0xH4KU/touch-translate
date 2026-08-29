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
const context = vm.createContext({
  __TOUCH_TRANSLATE_TEST__: api,
  URL,
  console,
  document: { body, documentElement },
  getComputedStyle: (element) => ({ display: element.display }),
});
vm.runInContext(source, context);

assert.equal(api.normalizeText("  hello\n  world "), "hello world");
assert.equal(api.pageTextLooksUseful("https://example.com/path"), false);
assert.equal(api.pageTextLooksUseful("2026-08-29"), false);
assert.equal(api.pageTextLooksUseful("A useful sentence."), true);
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

const touch = { identifier: 7, clientX: 40, clientY: 30 };
const touchList = { 0: touch, length: 1 };
assert.equal(api.pointFor(touchList, 7), touch);
assert.equal(
  api.movedTooFar(touchList, new Map([[7, { x: 0, y: 0 }]])),
  true,
);
assert.equal(api.indicatorFor(null), null);
const indicator = {
  classList: { contains: (value) => value === "touch-translate__indicator" },
};
assert.equal(
  api.indicatorFor({ children: { 0: indicator, length: 1 } }),
  indicator,
);

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

console.log("Touch Translate self-check passed");
