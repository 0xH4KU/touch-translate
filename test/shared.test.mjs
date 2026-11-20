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
  assert.equal(suite.endpointFor(`${googleBaseURL}/models`, "models/new", "gemini-native"), `${googleBaseURL}/models/new:generateContent`);
  assert.throws(() => suite.endpointFor(googleBaseURL, "bad/model", "gemini-native"), /Invalid Gemini model/);
  assert.equal(suite.parseImportedSettings({ ...settings, apiKey: undefined }, settings).apiKey, settings.apiKey);
  assert.equal(suite.parseImportedSettings({ baseURL: "https://other.example/v1", model: "new", apiFormat: "chat-completions" }, settings).apiKey, "");
  assert.throws(() => suite.parseImportedSettings({ version: 2, baseURL: settings.baseURL, model: "new" }), /Unsupported settings/);

  // Gemini native strips thought parts and rejects safety/incomplete outputs without dropping schema.
  const native = start(nativeSettings);
  const body = JSON.parse(transport.options.data);
  assert.equal(body.generationConfig.temperature, undefined);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "minimal");
  transport.options.onload({ status: 200, responseText: JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [
    { thought: true, text: "Internal reasoning" },
    { text: JSON.stringify(answer) },
  ] } }] }) });
  await native.promise;

  for (const response of [
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: JSON.stringify(answer) }] } }] },
  ]) {
    const blocked = start(nativeSettings);
    const count = transport.history.length;
    transport.options.onload({ status: 200, responseText: JSON.stringify(response) });
    await assert.rejects(blocked.promise, (error) => error.code === "TRANSLATION_RESPONSE_ERROR");
    assert.equal(transport.history.length, count);
  }

  // Credentials and URL secrets are redacted from diagnostics.
  const secretSettings = { ...settings, model: "redact-test", baseURL: "https://user:pass@api.example.com/v1?key=query-secret#frag" };
  const secretReq = start(secretSettings);
  transport.options.onload({ status: 401, responseText: JSON.stringify({ error: { message: `synthetic-api-secret ${transport.options.url}` } }) });
  await assert.rejects(secretReq.promise, (error) => {
    assert.doesNotMatch(error.message, /synthetic-api-secret|user:pass|query-secret|#frag/);
    return true;
  });

  // Abort cancels in-flight retries cleanly.
  const abortReq = start(settings);
  transport.options.onload({ status: 429, responseHeaders: "Retry-After: 60", responseText: '{"error":{"message":"Rate limit"}}' });
  abortReq.abort();
  await assert.rejects(abortReq.promise, (error) => error.name === "AbortError");

  // Unsupported thinking parameter falls back and is remembered per model.
  const chatThinking = { ...settings, model: "no-reasoning-chat", thinkingLevel: "high" };
  const thinkingReq = start(chatThinking);
  assert.equal(JSON.parse(transport.options.data).reasoning_effort, "high");
  transport.options.onload({ status: 400, responseText: JSON.stringify({ error: { message: "Unsupported parameter: 'reasoning_effort'" } }) });
  assert.equal(JSON.parse(transport.options.data).reasoning_effort, undefined);
  transport.options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }] }) });
  await thinkingReq.promise;
  const rememberedReq = start(chatThinking);
  assert.equal(JSON.parse(transport.options.data).reasoning_effort, undefined);
  transport.options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }] }) });
  await rememberedReq.promise;
}

// Unsupported structured output falls back cleanly.
const schemaFallbackSettings = { ...settings, model: "no-schema-chat" };
const schemaReq = api.requestTranslations(["hello"], schemaFallbackSettings);
transport.options.onload({ status: 400, responseText: JSON.stringify({ error: { message: "response_format json_schema is not supported" } }) });
assert.equal(JSON.parse(transport.options.data).response_format, undefined);
transport.options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"translations":["你好"]}' } }] }) });
assert.deepEqual([...(await schemaReq.promise)], ["你好"]);

// 429 backoff retry vs non-retryable quota error.
const rateReq = api.requestTranslations(["retry block"], settings);
const countBeforeRetry = transport.history.length;
transport.options.onload({ status: 429, responseHeaders: "Retry-After: 0", responseText: '{"error":{"message":"Rate limit reached"}}' });
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(transport.history.length, countBeforeRetry + 1);
transport.options.onload({ status: 200, responseText: '{"choices":[{"finish_reason":"stop","message":{"content":"{\\"translations\\":[\\"重試成功\\"]}"}}]}' });
assert.deepEqual([...(await rateReq.promise)], ["重試成功"]);

const quotaReq = api.requestTranslations(["quota block"], settings);
transport.options.onload({ status: 429, responseText: '{"error":{"message":"You exceeded your current quota"}}' });
await assert.rejects(quotaReq.promise, /quota/i);

// Cache eviction respects per-suite limits.
for (const [suite, key, limit] of [[api, "cache-v1", 500], [imageApi, "image-cache-v1", 150], [youtubeApi, "youtube-cache-v1", 200]]) {
  delete storage[key];
  suite.saveCache({ oldest: { at: 1, translation: "old" } });
  suite.saveCache(Object.fromEntries(Array.from({ length: limit }, (_, index) => [`entry-${index}`, { at: index + 10, translation: "cached" }])));
  assert.equal(Object.keys(storage[key]).length, limit);
  assert.equal(storage[key].oldest, undefined);
}
