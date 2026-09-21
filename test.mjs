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
  GM_info: { script: { version: source.match(/@version\s+(\S+)/)[1] } },
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
assert.equal(api.cleanSettings({ model: "gemini-3.1-flash-lite" }).apiFormat, "chat-completions");
assert.equal(api.cleanSettings({ apiFormat: "gemini-native" }).apiFormat, "gemini-native");
assert.equal(api.cleanSettings({}, { apiFormat: "gemini-native" }).apiFormat, "chat-completions");
assert.throws(() => api.cleanSettings({ apiFormat: "unknown" }), /API format/);
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
  /neutral, and impartial translation engine[\s\S]*naturally into zh-TW[\s\S]*without moral judgment[\s\S]*Do not add explanations or commentary[\s\S]*If paired \[\[TT0\]\]/,
);
assert.doesNotMatch(source, /prompt-v[12]\b/);
assert.match(source, /prompt-v3/);
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

// Only the selected API format enables native Gemini parameters and parsing.
// Model aliases need no Gemini keyword; Chat Completions stays generic on any host.
const googleBaseURL = "https://generativelanguage.googleapis.com/v1beta";
const googleChatBaseURL = `${googleBaseURL}/openai`;
// A gateway ID named "compat" is still a valid native provider route.
const gatewayBaseURL = "https://gateway.ai.cloudflare.com/v1/account/compat/google-ai-studio";
const customGatewayBaseURL = "https://ai.example.com/google-ai-studio";
const safetyCategories = [
  "HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT",
];
for (const [baseURL, model, mode, temperature, effort] of [
  [googleBaseURL, "gemini-3.1-flash-lite", "native", 1, "minimal"],
  [googleBaseURL, "gemini-3.1-pro-preview", "native", 1, undefined],
  [gatewayBaseURL, "gemini-3.1-flash-lite", "gateway", 1, "minimal"],
  [customGatewayBaseURL, "gemini-3.1-flash-lite", "gateway", 1, "minimal"],
  ["https://ai.example.com/compat", "google/gemini-3.1-flash-lite", "generic", 0.4, undefined],
  [customGatewayBaseURL, "translation-alias", "gateway", 0.4, undefined],
  [googleBaseURL, "translation-alias", "native", 0.4, undefined],
  [cacheSettings.baseURL, "google/GEMINI-3.1-flash-lite", "generic", 0.4, undefined],
  [cacheSettings.baseURL, "gemini-2.5-flash", "generic", 0.4, undefined],
  [cacheSettings.baseURL, "fast-model", "generic", 0.4, undefined],
  [googleChatBaseURL, "gemini-3.1-flash-lite", "generic", 0.4, undefined],
  ["https://proxy.example.com/v1beta", "translation-alias", "native", 0.4, undefined],
]) {
  const texts = ['a "quoted" comment', "another comment"];
  const native = mode === "native" || mode === "gateway";
  const request = api.requestTranslations(texts, {
    ...cacheSettings, baseURL, model, apiKey: "test", temperature: 0.4,
    apiFormat: native ? "gemini-native" : "chat-completions",
  });
  const body = JSON.parse(requestOptions.data);
  const safety = native ? body.safetySettings : body.safety_settings;
  if (mode === "generic") {
    assert.equal(safety, undefined);
    assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "response_format", "temperature"]);
  } else {
    assert.deepEqual(safety, safetyCategories.map(category => ({ category, threshold: "OFF" })));
  }
  if (native) {
    const prefix = mode === "gateway" ? `${baseURL}/v1beta` : baseURL;
    assert.equal(requestOptions.url, `${prefix}/models/${model}:generateContent`);
    assert.equal(requestOptions.headers["x-goog-api-key"], mode === "gateway" ? undefined : "test");
    assert.equal(requestOptions.headers["cf-aig-authorization"], mode === "gateway" ? "Bearer test" : undefined);
    assert.equal(requestOptions.headers.Authorization, undefined);
    assert.equal(body.safety_settings, undefined);
    assert.equal(body.generationConfig.temperature, temperature);
    assert.equal(body.generationConfig.thinkingConfig?.thinkingLevel, effort);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseJsonSchema.properties.translations.minItems, texts.length);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), texts);
    assert.match(body.systemInstruction.parts[0].text, /naturally into zh-TW/);
    assert.equal(body.messages, undefined);
  } else {
    assert.equal(requestOptions.url, `${baseURL}/chat/completions`);
    assert.equal(requestOptions.headers.Authorization, "Bearer test");
    assert.equal(requestOptions.headers["x-goog-api-key"], undefined);
    assert.equal(requestOptions.headers["cf-aig-authorization"], undefined);
    assert.equal(body.temperature, temperature);
    assert.equal(body.reasoning_effort, effort);
    assert.equal(body.response_format.type, "json_schema");
    assert.deepEqual(JSON.parse(body.messages[1].content), texts);
  }
  const translations = ["一則留言", "另一則留言"];
  requestOptions.onload({
    status: 200,
    responseText: JSON.stringify(native
      ? { candidates: [{ finishReason: "STOP", content: { parts: [
          { thought: true, text: "Internal thinking must not be parsed as the translation." },
          { text: '{"translations":' }, { text: `${JSON.stringify(translations)}}` },
        ] } }] }
      : { choices: [{ message: { content: JSON.stringify({ translations }) } }] }),
  });
  assert.deepEqual([...(await request.promise)], translations);
}
assert.equal(
  api.endpointFor(`${googleChatBaseURL}/chat/completions?test=1#ignored`, "models/gemini-3.1-flash-lite"),
  `${googleChatBaseURL}/chat/completions?test=1`,
);
for (const baseURL of [gatewayBaseURL, customGatewayBaseURL]) {
  for (const [suffix, version] of [["/", "v1beta"], ["/v1", "v1"], ["/v1beta/", "v1beta"], ["/v1beta/models/old-model:generateContent", "v1beta"]]) {
    for (const model of ["gemini-3.1-flash-lite", "models/gemini-3.1-flash-lite", "google/gemini-3.1-flash-lite", "google-ai-studio/gemini-3.1-flash-lite"]) {
      assert.equal(
        api.endpointFor(`${baseURL}${suffix}?test=1#ignored`, model, "gemini-native"),
        `${baseURL}/${version}/models/gemini-3.1-flash-lite:generateContent?test=1`,
      );
    }
  }
}
assert.equal(
  api.endpointFor("https://ai.example.com/google-ai-studio-other", "gemini-3.1-flash-lite"),
  "https://ai.example.com/google-ai-studio-other/chat/completions",
);
for (const baseURL of [
  googleChatBaseURL,
  "https://api.example.com/v1/chat/completions",
  "https://ai.example.com/compat",
  "https://ai.example.com/compat/google-ai-studio",
  "https://ai.example.com/compat/google-ai-studio/v1beta/models/alias:generateContent",
  "https://gateway.ai.cloudflare.com/v1/account/gateway/compat/google-ai-studio",
]) {
  assert.throws(() => api.endpointFor(baseURL, "alias", "gemini-native"), /native Base URL/);
}
assert.throws(
  () => api.endpointFor(`${googleBaseURL}/models/alias:generateContent`, "alias"),
  /Select Gemini/,
);

// HTTP errors expose the sent and final routes without URL credentials or keys.
for (const native of [true, false]) {
  const settings = {
    ...cacheSettings,
    apiFormat: native ? "gemini-native" : "chat-completions",
    baseURL: "https://url-user:url-password@ai.example.com/google-ai-studio?key=query-secret#fragment-secret",
    model: "gemini-3.1-flash-lite",
    apiKey: "diagnostic-api-secret",
  };
  const request = api.requestTranslations(["hello"], settings);
  const sent = new URL(requestOptions.url);
  const finalPath = `/compat${sent.pathname}`;
  const count = requestHistory.length;
  requestOptions.onload({
    status: 400,
    finalUrl: native
      ? `https://redirect-user:redirect-password@ai.example.com${finalPath}?key=redirect-secret`
      : "http://[", // An invalid transport URL must not replace the original error.
    responseHeaders: "CF-Ray: test-ray-NRT\r\ncf-aig-log-id: test-log\r\n",
    responseText: native
      ? JSON.stringify({ message: `Compatibility endpoint: ${sent.pathname.slice(1)} is not supported. ${settings.apiKey}` })
      : `Invalid request: ${settings.apiKey}`,
  });
  await assert.rejects(request.promise, (error) => {
    assert.match(error.message, native ? /HTTP 400[\s\S]*Compatibility endpoint/ : /returned invalid JSON/);
    assert.ok(error.message.includes(`API format: ${native ? "Gemini (native)" : "Chat Completions"}`));
    assert.ok(error.message.includes(`Touch Translate: ${context.GM_info.script.version}`));
    assert.ok(error.message.includes(`Request URL: https://ai.example.com${sent.pathname}`));
    if (native) assert.ok(error.message.includes(`Response URL: https://ai.example.com${finalPath}`));
    else assert.doesNotMatch(error.message, /Response URL:/);
    assert.match(error.message, /cf-ray: test-ray-NRT[\s\S]*cf-aig-log-id: test-log/);
    assert.match(error.message, /\[redacted\]/);
    assert.doesNotMatch(error.message, /url-user|url-password|redirect-user|redirect-password|query-secret|fragment-secret|redirect-secret|diagnostic-api-secret/);
    assert.equal(api.shouldSplitBatch(error), false);
    return true;
  });
  assert.equal(requestHistory.length, count);
}
assert.notEqual(
  api.hashCacheKey("same", { ...cacheSettings, model: "gemini-3.1-flash-lite", temperature: 0.2 }),
  api.hashCacheKey("same", { ...cacheSettings, model: "gemini-3.1-flash-lite", temperature: 1 }),
);
assert.equal(
  api.hashCacheKey("same", { ...cacheSettings, apiFormat: "gemini-native", model: "gemini-3.1-flash-lite", temperature: 0.2 }),
  api.hashCacheKey("same", { ...cacheSettings, apiFormat: "gemini-native", model: "gemini-3.1-flash-lite", temperature: 1 }),
);
assert.notEqual(
  api.hashCacheKey("same", cacheSettings),
  api.hashCacheKey("same", { ...cacheSettings, apiFormat: "gemini-native" }),
);

// Native fallback retains JSON mode and safety settings; Chat Completions
// keeps its generic fallback even when the model name contains Gemini.
for (const baseURL of [googleBaseURL, customGatewayBaseURL, cacheSettings.baseURL]) {
  const native = baseURL !== cacheSettings.baseURL;
  const request = api.requestTranslations(["hello"], {
    ...cacheSettings, baseURL, model: "gemini-3.1-flash-lite", apiKey: "test",
    apiFormat: native ? "gemini-native" : "chat-completions",
  });
  requestOptions.onload({ status: 400, responseText: JSON.stringify({
    error: { message: native ? "Unsupported responseJsonSchema" : "Unsupported response_format json_schema" },
  }) });
  const body = JSON.parse(requestOptions.data);
  assert.equal(requestOptions.headers["cf-aig-authorization"], baseURL === customGatewayBaseURL ? "Bearer test" : undefined);
  assert.equal(body.safety_settings, undefined);
  if (native) {
    assert.equal(body.safetySettings.every(s => s.threshold === "OFF"), true);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.generationConfig.responseJsonSchema, undefined);
  } else {
    assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "temperature"]);
  }
  requestOptions.onload({ status: 200, responseText: JSON.stringify(native
    ? { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"translations":["你好"]}' }] } }] }
    : { choices: [{ message: { content: '{"translations":["你好"]}' } }] }) });
  assert.deepEqual([...(await request.promise)], ["你好"]);
}

// A schema failure in native mode must not disable Chat Completions schemas
// after switching formats on the same Base URL and model.
const switchedFormat = api.requestTranslations(["hello"], {
  ...cacheSettings, baseURL: customGatewayBaseURL, model: "gemini-3.1-flash-lite", apiKey: "test",
  apiFormat: "chat-completions",
});
assert.equal(JSON.parse(requestOptions.data).response_format.type, "json_schema");
assert.equal(JSON.parse(requestOptions.data).safety_settings, undefined);
requestOptions.onload({ status: 200, responseText: '{"choices":[{"message":{"content":"{\\"translations\\":[\\"你好\\"]}"}}]}' });
assert.deepEqual([...(await switchedFormat.promise)], ["你好"]);

for (const response of [
  { promptFeedback: { blockReason: "SAFETY" } },
  { candidates: [{ finishReason: "SAFETY" }] },
  { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"translations":[' }] } }] },
]) {
  const request = api.requestTranslations(["hello"], {
    ...cacheSettings, baseURL: googleBaseURL, model: "gemini-3.1-flash-lite", apiKey: "test",
    apiFormat: "gemini-native",
  });
  const count = requestHistory.length;
  requestOptions.onload({ status: 200, responseText: JSON.stringify(response) });
  await assert.rejects(request.promise, api.shouldSplitBatch);
  assert.equal(requestHistory.length, count);
}

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
  closest: () => null,
  display: "flow-root",
  innerText: "A generic text block",
  matches: () => false,
  parentElement: outerListItem,
};
const inlineText = {
  closest: () => null,
  display: "inline",
  innerText: "A generic text block",
  matches: () => false,
  parentElement: genericBlock,
};
assert.equal(api.swipeElementFor(inlineText), genericBlock);

// YouTube's visible mobile comment is aria-hidden inside a labelled button.
// Only the comment root gets this exception; hidden descendants stay excluded.
const mobileComment = {
  ...pageBlock,
  display: "block",
  visibility: "visible",
  innerText: "A comment with a link",
  matches(selector) {
    return selector.split(", ").some((part) =>
      ["p", "ytm-comment-renderer .YtmCommentRendererText", "[aria-hidden='true']"].includes(part),
    );
  },
  closest(selector) { return this.matches(selector) ? this : null; },
  querySelector: () => null,
};
const commentNode = { nodeValue: mobileComment.innerText, parentElement: mobileComment };
const hiddenCommentNode = {
  nodeValue: "Hidden metadata",
  parentElement: {
    display: "inline", visibility: "visible", parentElement: mobileComment,
    matches: (selector) => selector.includes("[aria-hidden='true']"),
  },
};
mobileComment.textNodes = [commentNode, hiddenCommentNode];
assert.equal(api.isRenderedTextNode(commentNode, mobileComment), true);
assert.equal(api.isRenderedTextNode(hiddenCommentNode, mobileComment), false);
assert.equal(api.translationRequestFor(mobileComment, mobileComment.innerText).requestText, mobileComment.innerText);
assert.equal(api.isTranslatablePageBlock(mobileComment, [{ contains: () => true }]), true);
assert.equal(api.swipeElementFor(mobileComment), mobileComment);
mobileComment.parentElement = { closest: () => ({ tagName: "NAV" }) };
assert.equal(api.isTranslatablePageBlock(mobileComment, [{ contains: () => true }]), false);
delete mobileComment.parentElement;
const unrelatedHiddenText = {
  ...mobileComment,
  matches: (selector) => selector.split(", ").includes("[aria-hidden='true']"),
};
assert.equal(api.isRenderedTextNode({ parentElement: unrelatedHiddenText }, unrelatedHiddenText), false);

const commentTranslation = { classList: { contains: () => true } };
const expander = { nextElementSibling: commentTranslation };
const desktopComment = {
  matches: () => true,
  closest: (selector) => selector.includes("ytd-expander") ? expander : null,
  nextElementSibling: null,
};
assert.equal(api.translationAfter(desktopComment), commentTranslation);
const mobileRenderer = { nextElementSibling: commentTranslation };
assert.equal(api.translationAfter({
  ...desktopComment,
  closest: (selector) => selector.includes("ytm-comment-renderer") ? mobileRenderer : null,
}), commentTranslation);

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

// Content filter detection
const contentFilterRequest = api.requestTranslations(["filter test"], {
  apiKey: "test",
  baseURL: "https://api.example.com/v1",
  model: "test-model",
  targetLanguage: "zh-TW",
});
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [
      {
        finish_reason: "content_filter",
        message: { content: "" },
      },
    ],
  }),
});
await assert.rejects(
  contentFilterRequest.promise,
  /blocked by the AI content safety filter/i,
);

// Empty response defense
const emptyContentRequest = api.requestTranslations(["empty test"], {
  apiKey: "test",
  baseURL: "https://api.example.com/v1",
  model: "test-model",
  targetLanguage: "zh-TW",
});
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [
      {
        finish_reason: "stop",
        message: { content: "  " },
      },
    ],
  }),
});
assert.equal(JSON.parse(requestOptions.data).response_format, undefined);
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({ choices: [{ message: { content: "" } }] }),
});
await assert.rejects(
  emptyContentRequest.promise,
  /The AI returned an empty response/i,
);

// parseTranslations empty defense
assert.throws(
  () => api.parseTranslations("", 1),
  /The AI output was empty/,
);

// Split only model response failures, never infrastructure/configuration errors.
assert.throws(() => api.parseTranslations("", 1), api.shouldSplitBatch);
for (const message of ["HTTP 400", "HTTP 401", "HTTP 429", "HTTP 503", "quota", "Could not connect"]) {
  assert.equal(api.shouldSplitBatch(new Error(message)), false);
}

// Empty structured output can recover without any provider-specific fields.
const recoveredRequest = api.requestTranslations(["hello"], retrySettings);
assert.equal(JSON.parse(requestOptions.data).response_format.type, "json_schema");
requestOptions.onload({ status: 200, responseText: '{"choices":[]}' });
assert.equal(JSON.parse(requestOptions.data).response_format, undefined);
assert.deepEqual(Object.keys(JSON.parse(requestOptions.data)).sort(), ["messages", "model", "temperature"]);
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({ choices: [{ message: { content: '{"translations":["你好"]}' } }] }),
});
assert.deepEqual([...(await recoveredRequest.promise)], ["你好"]);

// Exercise the real scheduler/job lifecycle with rendering and transport stubbed.
async function checkBatchRecovery(mode) {
  const elements = ["first", "second", "third"].map((text) => ({
    text, isConnected: true, busy: null,
    getAttribute() { return this.busy; },
    setAttribute(_name, value) { this.busy = value; },
    removeAttribute() { this.busy = null; },
  }));
  const task = { cancelled: false, jobs: new Set() };
  const calls = [];
  const translated = [];
  let scheduler;
  const responseFailure = Object.assign(new Error("empty response"), {
    code: "TRANSLATION_RESPONSE_ERROR",
  });
  const sandbox = {
    Error, Map, Set, WeakMap, clearTimeout,
    BATCH_MAX_CHARS: 6000,
    readySettings: async () => retrySettings,
    loadCache: () => ({}), saveCache() {},
    sourceText: (element) => element.text,
    translationAfter: (element) => translated.includes(element),
    translationRequestFor: (_element, text) => ({ requestText: text, segmentCount: 0 }),
    hashCacheKey: (text) => text,
    groupRecords: api.groupRecords, makeBatches: api.makeBatches,
    parseInlineTranslation: api.parseInlineTranslation,
    recordMatchesElement: (record) => record.element.isConnected,
    shouldSplitBatch: api.shouldSplitBatch,
    showIndicator() {}, removeIndicator() {}, toast() {},
    insertTranslation(element) { translated.push(element); },
    requestTranslations(texts) {
      calls.push([...texts]);
      let rejectRequest;
      const promise = new Promise((resolve, reject) => {
        rejectRequest = reject;
        queueMicrotask(() => {
          if (texts.length > 1 || (mode === "failure" && texts[0] === "first")) {
            reject(responseFailure);
          } else if (mode === "cancel" && texts[0] === "first") {
            scheduler.cancelJob(elements[0]);
          } else if (mode === "cancel-waiting" && texts[0] === "first") {
            scheduler.cancelJob(elements[1]);
            resolve(["translated"]);
          } else if (mode === "http" && texts[0] === "first") {
            reject(new Error("HTTP 401"));
          } else {
            resolve(["translated"]);
          }
        });
      });
      return { promise, abort() { rejectRequest(Object.assign(new Error("cancelled"), { name: "AbortError" })); } };
    },
  };
  scheduler = vm.runInNewContext(
    source.slice(source.indexOf("  const pendingJobs ="), source.indexOf("  function reportError(")) +
      "\n({ translateElements, cancelJob })",
    sandbox,
  );
  const run = scheduler.translateElements(elements, { task });
  if (mode === "failure" || mode === "http") {
    await assert.rejects(run, (error) => {
      assert.equal(error.message, mode === "http" ? "HTTP 401" : "empty response");
      assert.deepEqual(Array.from(error.retryElements), mode === "http" ? elements : [elements[0]]);
      return true;
    });
  } else {
    await run;
  }
  assert.equal(task.jobs.size, 0);
  assert.ok(elements.every((element) => element.busy === null));
  assert.deepEqual(translated, mode === "http" ? [] : mode === "cancel-waiting" ? [elements[0], elements[2]] : mode === "success" ? elements : elements.slice(1));
  assert.equal(calls.length, mode === "http" ? 2 : mode === "cancel-waiting" ? 3 : 4);
}
for (const mode of ["success", "failure", "cancel", "cancel-waiting", "http"]) {
  await checkBatchRecovery(mode);
}

console.log("Touch Translate self-check passed");
