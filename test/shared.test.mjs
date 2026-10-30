import assert from "node:assert/strict";
import { createHarness, cacheSettings, googleBaseURL } from "./fixtures.mjs";
import { buildUserscript } from "../scripts/build.mjs";

const { api, imageApi, youtubeApi, source, imageSource, youtubeSource, context, transport, storage } = createHarness();
assert.equal(await buildUserscript("text"), source);
assert.equal(await buildUserscript("image"), imageSource);
assert.equal(await buildUserscript("youtube"), youtubeSource);

const settings = { ...cacheSettings, apiKey: "synthetic-api-secret", apiFormat: "chat-completions", thinkingLevel: "medium" };
const nativeSettings = { ...settings, apiFormat: "gemini-native", baseURL: googleBaseURL, model: "gemini-3.5-flash-lite", thinkingLevel: "minimal" };
const imageData = { base64: "dGVzdA==", mimeType: "image/png" };
const imageResult = { has_text: true, regions: [{ box_2d: [100, 100, 300, 700], translation: "圖片譯文" }] };
const requests = [
  { suite: api, start: (s) => api.requestTranslations(["An ambiguous sentence."], s), answer: { translations: ["完整的譯文。"] } },
  { suite: imageApi, start: (s) => imageApi.requestImageTranslation(imageData, s), answer: imageResult },
  { suite: youtubeApi, start: (s) => youtubeApi.requestSubtitleTranslation({
    fragments: [{ start: 1000, end: 2500, text: "A complete caption." }], context: "", automatic: false,
  }, s, true), answer: { groups: [{ from: 0, to: 0, translation: "完整字幕。" }] } },
];

for (const { suite, start, answer } of requests) {
  for (const baseURL of [`${googleBaseURL}/models`, `${googleBaseURL}/models/old:streamGenerateContent`]) {
    assert.equal(suite.endpointFor(baseURL, "models/new", "gemini-native"), `${googleBaseURL}/models/new:generateContent`);
  }
  for (const model of ["..", ".", "nested/model", "bad?key=value", "bad#fragment"]) {
    assert.throws(() => suite.endpointFor(googleBaseURL, model, "gemini-native"), /Invalid Gemini model/);
  }
  assert.equal(suite.parseImportedSettings({ ...settings, apiKey: undefined }, settings).apiKey, settings.apiKey);
  const foreignProvider = suite.parseImportedSettings({ baseURL: "https://other.example/v1", model: "new", apiFormat: "chat-completions" }, settings);
  assert.equal(foreignProvider.apiKey, "");
  assert.equal(suite.parseImportedSettings({ ...nativeSettings, apiKey: undefined }, settings).apiKey, "");
  assert.throws(() => suite.parseImportedSettings({ version: 2, baseURL: settings.baseURL, model: "new" }), /Unsupported settings/);

  const native = start(nativeSettings);
  const body = JSON.parse(transport.options.data);
  assert.equal(body.generationConfig.temperature, undefined);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
  transport.options.onload({ status: 200, responseText: JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [
    { thought: true, text: "This is not part of the JSON answer." },
    { text: JSON.stringify(answer) },
  ] } }] }) });
  await native.promise;

  for (const response of [
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "SAFETY", content: { parts: [{ text: JSON.stringify(answer) }] } }] },
    { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: JSON.stringify(answer) }] } }] },
  ]) {
    const request = start(nativeSettings);
    const count = transport.history.length;
    transport.options.onload({ status: 200, responseText: JSON.stringify(response) });
    await assert.rejects(request.promise, (error) => error.code === "TRANSLATION_RESPONSE_ERROR");
    assert.equal(transport.history.length, count, "Blocked or incomplete output must not retry without its schema");
  }

  for (const status of [401, 200]) {
    const secretSettings = { ...settings, model: `redact-${status}`, baseURL: "https://fake-user:fake-password@api.example.com/v1?key=fake-query-secret#fake-fragment" };
    const request = start(secretSettings);
    const reply = () => {
      const diagnostic = `synthetic-api-secret ${transport.options.url}`;
      transport.options.onload({ status, responseText: JSON.stringify(status === 401
        ? { error: { message: diagnostic } }
        : { choices: [{ finish_reason: "stop", message: { content: diagnostic } }] }) });
    };
    reply();
    if (status === 200 && suite === imageApi) reply();
    await assert.rejects(request.promise, (error) => {
      assert.doesNotMatch(error.message, /synthetic-api-secret|fake-user|fake-password|fake-query-secret|fake-fragment/);
      return true;
    });
  }

  const request = start(settings);
  transport.options.onload({ status: 429, responseHeaders: "Retry-After: 60", responseText: '{"error":{"message":"Rate limit reached"}}' });
  request.abort();
  await assert.rejects(request.promise, (error) => error.name === "AbortError");

  const priorTransport = context.GM_xmlhttpRequest;
  context.GM_xmlhttpRequest = () => ({ abort() {} });
  const silentAbort = start(settings);
  silentAbort.abort();
  await assert.rejects(silentAbort.promise, (error) => error.name === "AbortError");
  context.GM_xmlhttpRequest = priorTransport;
}

assert.equal(api.parseInlineTranslation("<0>Hallucinated wrapper</0> and stray <0> or <1/> tag.", 0).translation, "Hallucinated wrapper and stray  or  tag.");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.parseInlineTranslation("閱讀 ＜0＞這篇＜/0＞ 文章", 1).segments)),
  ["閱讀 ", { index: 0, children: ["這篇"] }, " 文章"],
);
const lostParagraphs = api.requestTranslations(["First paragraph.\n\nSecond paragraph."], settings);
transport.options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"translations":["Two paragraphs collapsed into one."]}' } }] }) });
await assert.rejects(lostParagraphs.promise, /did not preserve paragraph and line breaks/);
const crlfParagraphs = api.requestTranslations(["First paragraph.\n\nSecond paragraph."], settings);
transport.options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translations: ["第一段。\r\n\r\n第二段。"] }) } }] }) });
assert.equal((await crlfParagraphs.promise)[0], "第一段。\n\n第二段。");
assert.equal(api.hashCacheKey("same", nativeSettings), api.hashCacheKey("same", { ...nativeSettings, temperature: 1.8 }));
assert.equal(imageApi.hashImageCacheKey("same", nativeSettings), imageApi.hashImageCacheKey("same", { ...nativeSettings, temperature: 1.8 }));
assert.notEqual(api.hashCacheKey("same", settings), api.hashCacheKey("same", { ...settings, thinkingLevel: "high" }));
assert.notEqual(imageApi.hashImageCacheKey("same", nativeSettings), imageApi.hashImageCacheKey("same", { ...nativeSettings, thinkingLevel: "high" }));

for (const [suite, key, limit] of [[api, "cache-v1", 500], [imageApi, "image-cache-v1", 150], [youtubeApi, "youtube-cache-v1", 200]]) {
  delete storage[key];
  suite.saveCache({ first: { at: 1, translation: "first" } });
  suite.saveCache({ second: { at: 2, translation: "second" } });
  assert.equal(Object.keys(storage[key]).length, 2);
  suite.saveCache(Object.fromEntries(Array.from({ length: limit + 1 }, (_, index) => [`entry-${index}`, { at: index + 10, translation: "cached" }])));
  assert.equal(Object.keys(storage[key]).length, limit);
  assert.equal(storage[key].first, undefined);
  assert.equal(storage[key][`entry-${limit}`].translation, "cached");
}
