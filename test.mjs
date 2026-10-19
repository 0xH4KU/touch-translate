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
    whiteSpace: element.whiteSpace,
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
  /professional native translator[\s\S]*naturally into zh-TW[\s\S]*without omissions, moral judgment, lecturing, or self-censorship[\s\S]*idiomatic phrasing and natural target-language word order[\s\S]*Do not add explanations or commentary/,
);
assert.doesNotMatch(requestBody.messages[0].content, /\[\[TT0\]\]/);
assert.doesNotMatch(source, /prompt-v[123]\b/);
assert.match(source, /prompt-v4/);
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
  "HARM_CATEGORY_CIVIC_INTEGRITY",
];
for (const [baseURL, model, mode, temperature, effort] of [
  [googleBaseURL, "gemini-3.1-flash-lite", "native", 0.4, "minimal"],
  [googleBaseURL, "gemini-3.1-pro-preview", "native", 0.4, undefined],
  [gatewayBaseURL, "gemini-3.1-flash-lite", "gateway", 0.4, "minimal"],
  [customGatewayBaseURL, "gemini-3.1-flash-lite", "gateway", 0.4, "minimal"],
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
    assert.match(body.contents[0].parts[0].text, /^Translate the following web page content into zh-TW:\n\n/);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text.replace(/^[\s\S]*?\n\n/, "")), texts);
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
    assert.match(body.messages[1].content, /^Translate the following web page content into zh-TW:\n\n/);
    assert.deepEqual(JSON.parse(body.messages[1].content.replace(/^[\s\S]*?\n\n/, "")), texts);
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
assert.notEqual(
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

// Multi-node elements extract clean plain text without [[TT0]] markers or button/hidden noise.
const multiNodeElement = {
  display: "block",
  innerText: "Read Copy this article by John.",
  matches: () => false,
  parentElement: null,
  visibility: "visible",
};
const buttonParent = {
  display: "inline-block",
  matches: (selector) => selector.includes("button"),
  parentElement: multiNodeElement,
  visibility: "visible",
};
multiNodeElement.textNodes = [
  { nodeValue: "Read ", parentElement: multiNodeElement },
  { nodeValue: "Copy", parentElement: buttonParent },
  { nodeValue: "this article", parentElement: multiNodeElement },
  { nodeValue: " by ", parentElement: multiNodeElement },
  { nodeValue: "John.", parentElement: multiNodeElement },
];
assert.equal(api.sourceText(multiNodeElement), "Read this article by John.");
assert.deepEqual(
  { ...api.translationRequestFor(multiNodeElement, api.sourceText(multiNodeElement)) },
  { requestText: "Read this article by John.", segmentCount: 0 },
);

// Multi-paragraph blocks preserve <br>, white-space newlines, and block boundaries.
const brParagraphBlock = {
  display: "block",
  innerText: "First paragraph\n\nSecond paragraph\nThird line",
  matches: () => false,
  parentElement: null,
  visibility: "visible",
  whiteSpace: "normal",
};
brParagraphBlock.textNodes = [
  { nodeValue: "First paragraph ", parentElement: brParagraphBlock },
  { tagName: "BR", parentElement: brParagraphBlock },
  { tagName: "BR", parentElement: brParagraphBlock },
  { nodeValue: " Second paragraph", parentElement: brParagraphBlock },
  { tagName: "BR", parentElement: brParagraphBlock },
  { nodeValue: "Third line", parentElement: brParagraphBlock },
];
assert.equal(
  api.sourceText(brParagraphBlock),
  "First paragraph\n\nSecond paragraph\nThird line",
);
assert.equal(
  api.translationRequestFor(brParagraphBlock, api.sourceText(brParagraphBlock)).requestText,
  "First paragraph\n\nSecond paragraph\nThird line",
);

const preWrapTweetBlock = {
  display: "block",
  innerText: "Lead paragraph\n\nFollow-up paragraph\nFinal note",
  matches: () => false,
  parentElement: null,
  visibility: "visible",
  whiteSpace: "pre-wrap",
};
preWrapTweetBlock.textNodes = [
  { nodeValue: "Lead paragraph", parentElement: preWrapTweetBlock },
  { nodeValue: "\n\n", parentElement: preWrapTweetBlock },
  { nodeValue: "Follow-up paragraph\nFinal note", parentElement: preWrapTweetBlock },
];
assert.equal(
  api.sourceText(preWrapTweetBlock),
  "Lead paragraph\n\nFollow-up paragraph\nFinal note",
);

const multiLineRequest = api.requestTranslations(
  [api.sourceText(brParagraphBlock), "Single line block"],
  retrySettings,
);
const multiLineBody = JSON.parse(requestOptions.data);
assert.equal(
  multiLineBody.messages[1].content.endsWith(
    JSON.stringify([
      "First paragraph",
      "Second paragraph",
      "Third line",
      "Single line block",
    ]),
  ),
  true,
);
assert.equal(
  multiLineBody.response_format.json_schema.schema.properties.translations.minItems,
  4,
);
requestOptions.onload({
  status: 200,
  responseText: JSON.stringify({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            translations: ["第一段", "第二段", "第三行", "單行區塊"],
          }),
        },
      },
    ],
  }),
});
assert.deepEqual([...(await multiLineRequest.promise)], [
  "第一段\n\n第二段\n第三行",
  "單行區塊",
]);

// Non-title blocks (like <li> cards) with nested text blocks are excluded from page translation.
const cardListItem = {
  ...pageBlock,
  children: [nestedTextBlock],
  innerText: "Card header and nested paragraph",
  matches: (selector) => selector.includes("li") && !selector.includes("h1"),
  querySelector: () => null,
};
assert.equal(api.isTranslatablePageBlock(cardListItem, [{ contains: () => true }]), false);

// Exercise the real scheduler/job lifecycle with rendering and transport stubbed.
async function checkBatchRecovery(mode) {
  const elements = ["first", "second", "third"].map((text) => ({
    text, isConnected: true, busy: null,
    getAttribute() { return this.busy; },
    setAttribute(_name, value) { this.busy = value; },
    removeAttribute() { this.busy = null; },
  }));
  const task = { autoPage: mode === "auto-failure", cancelled: false, jobs: new Set() };
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
          if (texts.length > 1 || ((mode === "failure" || mode === "auto-failure") && texts[0] === "first")) {
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
for (const mode of ["success", "failure", "auto-failure", "cancel", "cancel-waiting", "http"]) {
  await checkBatchRecovery(mode);
}

// Standalone Touch Image Translate userscript tests
const imageSource = readFileSync(
  new URL("./touch-image-translate.user.js", import.meta.url),
  "utf8",
);
assert.match(imageSource, /@name\s+Touch Image Translate/);
assert.doesNotMatch(imageSource, /innerHTML/);
assert.doesNotMatch(imageSource, /drop-shadow/);
assert.doesNotMatch(imageSource, /prompt-v[123]\b/);

const imageApi = {};
context.__TOUCH_IMAGE_TRANSLATE_TEST__ = imageApi;
vm.runInContext(imageSource, context);

// Settings interoperability between Touch Translate and Touch Image Translate
const ttExportedPayload = {
  version: 1,
  exportedAt: "2026-10-18T00:00:00.000Z",
  settings: {
    apiFormat: "gemini-native",
    baseURL: "https://gateway.ai.cloudflare.com/v1/acc/gw/google-ai-studio",
    model: "google-ai-studio/gemini-3.1-flash-lite",
    targetLanguage: "Traditional Chinese",
    temperature: 0.35,
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
const normalizedTupleRegion = imageApi.normalizeImageRegion([50, 120, 250, 640]);
assert.deepEqual([...normalizedTupleRegion.box_2d], [50, 120, 250, 640]);
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
  '```json\n{"has_text":true,"translation":"[[BABEL_REGION_1]] 歡迎光臨\\n[[BABEL_REGION_2]] 今日特餐","regions":[[100,150,240,850],[400,150,550,850]]}\n```',
);
assert.equal(parsedImage.hasText, true);
assert.equal(parsedImage.regions.length, 2);
assert.deepEqual([...parsedImage.regions[0].box_2d], [100, 150, 240, 850]);
assert.equal(parsedImage.regions[0].translation, "歡迎光臨");
assert.equal(parsedImage.translation, "[1] 歡迎光臨\n\n[2] 今日特餐");

// Macro-block merging for dense text (> 5 vertically close, aligned regions)
const denseJson = JSON.stringify({
  has_text: true,
  translation: [
    "[[BABEL_REGION_1]] 第一段第一行",
    "[[BABEL_REGION_2]] 第一段第二行",
    "[[BABEL_REGION_3]] 第一段第三行",
    "[[BABEL_REGION_4]] 第二段第一行",
    "[[BABEL_REGION_5]] 第二段第二行",
    "[[BABEL_REGION_6]] 底部獨立標題",
  ].join("\n"),
  regions: [
    [100, 100, 140, 800],
    [148, 100, 188, 800],
    [195, 100, 235, 780],
    [400, 100, 440, 800],
    [448, 100, 488, 790],
    [800, 200, 860, 700],
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
  const textOnlyImage = imageApi.parseImageTranslation(JSON.stringify({
    ...invalidBoxImage,
    regions: [invalidBoxImage.regions[0], { ...invalidBoxImage.regions[1], box_2d: box }],
  }));
  assert.equal(textOnlyImage.hasText, true);
  assert.equal(textOnlyImage.regions.length, 0);
  assert.equal(textOnlyImage.translation, "[1] 第一區譯文\n\n[2] 第二區譯文");
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

const noTextImage = imageApi.parseImageTranslation(
  '{"has_text":false,"regions":[]}',
);
assert.equal(noTextImage.hasText, false);
assert.equal(noTextImage.translation, "");
assert.equal(noTextImage.regions.length, 0);

assert.throws(() => imageApi.parseImageTranslation(""), /The AI output was empty/);
assert.throws(() => imageApi.parseImageTranslation("not json"), /Response format mismatch/);

// Two long lines, a one-letter final line, and punctuation must all stay inside the box.
const shortLineWidth = 240;
const shortLineHeight = 140;
const shortLinePixels = new Uint8ClampedArray(shortLineWidth * shortLineHeight * 4).fill(255);
const shortLineBox = [107, 104, 786, 855];
const setShortLinePixel = (x, y) => {
  const idx = (y * shortLineWidth + x) * 4;
  shortLinePixels[idx] = shortLinePixels[idx + 1] = shortLinePixels[idx + 2] = 0;
};
const shortLineGlyph = ["10001", "10001", "10001", "11111", "10001", "10001", "10001"];
for (const [top, count] of [[20, 12], [50, 12], [90, 1]]) {
  for (let i = 0; i < count; i += 1) {
    shortLineGlyph.forEach((row, y) => {
      [...row].forEach((bit, x) => {
        if (bit !== "1") return;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            setShortLinePixel(30 + i * 14 + x * 2 + dx, top + y * 2 + dy);
          }
        }
      });
    });
  }
}
for (let y = 102; y <= 103; y += 1) {
  for (let x = 200; x <= 201; x += 1) setShortLinePixel(x, y);
}

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

// Spotlight Mode SVG markup: unselected boxes have stroke-opacity="0", active box has stroke-opacity="0.95"
const svgMarkupDefault = imageApi.buildRegionBoxesMarkup(400, 200, parsedImage.regions);
assert.match(svgMarkupDefault, /viewBox="0 0 400 200"/);
assert.match(svgMarkupDefault, /data-region="1"/);
assert.match(svgMarkupDefault, /stroke-opacity="0"/);
assert.doesNotMatch(svgMarkupDefault, /data-active="true"/);

const svgMarkupActive = imageApi.buildRegionBoxesMarkup(400, 200, parsedImage.regions, "2");
assert.match(svgMarkupActive, /data-region="2" data-active="true"/);
assert.match(svgMarkupActive, /stroke-opacity="0\.95"/);
assert.match(svgMarkupActive, /#f59e0b/);

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
  dataBase64: "aGVsbG8=",
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
    width: shortLineWidth,
    height: shortLineHeight,
    pixels: shortLinePixels,
  }, imageSettings);
  const sentBody = JSON.parse(requestOptions.data);
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
  requestOptions.onload({
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

  const textOnlyRequest = imageApi.requestImageTranslation(sampleImageData, imageSettings);
  const textOnlyRequestCount = requestHistory.length;
  const textOnlyJson = JSON.stringify(invalidBoxImage);
  requestOptions.onload({
    status: 200,
    responseText: JSON.stringify(
      native
        ? { candidates: [{ finishReason: "STOP", content: { parts: [{ text: textOnlyJson }] } }] }
        : { choices: [{ finish_reason: "stop", message: { content: textOnlyJson } }] },
    ),
  });
  assert.equal(requestHistory.length, textOnlyRequestCount);
  const textOnlyResult = await textOnlyRequest.promise;
  assert.equal(textOnlyResult.regions.length, 0);
  assert.equal(textOnlyResult.translation, "[1] 第一區譯文\n\n[2] 第二區譯文");
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
              translation: "[[BABEL_REGION_1]] 圖片翻譯",
              regions: [[100, 100, 300, 900]],
            }),
          },
        ],
      },
    },
  ],
});
const imageFallback = imageApi.requestImageTranslation(sampleImageData, visionSettings);
const schemaBody = JSON.parse(requestOptions.data);
const fallbackCount = requestHistory.length;
requestOptions.onload({
  status: 400,
  responseText: JSON.stringify({
    error: {
      code: 400,
      status: "INVALID_ARGUMENT",
      message: "Request contains an invalid argument.",
    },
  }),
});
const jsonBody = JSON.parse(requestOptions.data);
assert.equal(requestHistory.length, fallbackCount + 1);
assert.equal(jsonBody.generationConfig.responseJsonSchema, undefined);
assert.equal(jsonBody.generationConfig.responseMimeType, "application/json");
delete schemaBody.generationConfig.responseJsonSchema;
assert.deepEqual(jsonBody, schemaBody);
requestOptions.onload({ status: 200, responseText: nativeImageResponse });
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
  const sentURL = new URL(requestOptions.url);
  requestOptions.onload({ status: 401, responseText: JSON.stringify({ error: {
    message: `Unauthorized diagnostic-api-secret at ${requestOptions.url}`,
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
  requestOptions.onload({ status: 200, responseText: JSON.stringify({ choices: [{
    message: { content: `invalid-json diagnostic-api-secret ${requestOptions.url}` },
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

const scrolledCarousel = {
  clientWidth: 300,
  direction: "ltr",
  overflowX: "auto",
  scrollLeft: 40,
  scrollWidth: 900,
};
assert.equal(imageApi.canConsumeRightSwipe(scrolledCarousel), true);
assert.equal(
  imageApi.canConsumeRightSwipe({ ...scrolledCarousel, scrollLeft: 0 }),
  false,
);

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
  requestAborted = false;
  const pendingImage = imageApi.translateImage(mockImg);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const oldRequest = requestOptions;
  assert.equal(oldRequest.method, "POST");
  mockImg.currentSrc = "data:image/png;base64,aGVsbG8=";
  if (observeBeforeReply) {
    imageApi.syncImageOverlay(mockImg);
    assert.equal(requestAborted, true);
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
                translation: "[[BABEL_REGION_1]] 舊圖片的譯文",
                regions: [[100, 100, 300, 900]],
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

console.log("Touch Translate self-check passed");
