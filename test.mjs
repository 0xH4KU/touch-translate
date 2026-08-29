import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("./touch-translate.user.js", import.meta.url),
  "utf8",
);
const api = {};
const context = vm.createContext({
  __TOUCH_TRANSLATE_TEST__: api,
  URL,
  console,
});
vm.runInContext(source, context);

assert.equal(api.normalizeText("  hello\n  world "), "hello world");
assert.equal(
  api.endpointFor("https://api.example.com/v1/"),
  "https://api.example.com/v1/chat/completions",
);
assert.deepEqual(
  [...api.parseTranslations('```json\n{"translations":["甲","乙"]}\n```', 2)],
  ["甲", "乙"],
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

console.log("Touch Translate self-check passed");
