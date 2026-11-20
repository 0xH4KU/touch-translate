import assert from "node:assert/strict";
import vm from "node:vm";
import { createHarness } from "./fixtures.mjs";

function bridgeHarness({ blockedScripts = false, frozenHooks = false, noUnsafeWindow = false } = {}) {
  const { youtubeApi: api, context, transport } = createHarness();
  const events = new EventTarget();
  const document = new EventTarget();
  const attributes = new Map();
  document.documentElement = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
  };
  const videoId = "abcdefghijk";
  const captionUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en`;
  const player = { getPlayerResponse: () => ({ videoDetails: { videoId }, captions: {
    playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: captionUrl, languageCode: "en", vssId: ".en" }] },
  } }) };
  document.querySelector = (selector) => selector === "#movie_player" ? player : null;
  const location = { origin: "https://www.youtube.com", href: `https://www.youtube.com/watch?v=${videoId}` };
  const loads = [];
  const root = {
    document, location,
    fetch: async (url) => { loads.push(url); return new Response('{"events":[]}'); },
    XMLHttpRequest: class { open() {} },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    postMessage(data) {
      queueMicrotask(() => {
        const event = new Event("message");
        Object.assign(event, { data, source: null, origin: location.origin });
        events.dispatchEvent(event);
      });
    },
  };
  if (frozenHooks) {
    Object.defineProperty(root, "fetch", { writable: false });
    Object.freeze(root.XMLHttpRequest.prototype);
  }
  const pageContext = vm.createContext({ window: root, document, location, URL, URLSearchParams, AbortController, CustomEvent });
  const inject = (element) => {
    if (blockedScripts) throw new Error("Blocked by page CSP");
    if (!element.removed) vm.runInContext(element.textContent, pageContext);
  };
  document.head = { append: inject };
  document.createElement = () => ({ remove() { this.removed = true; } });
  Object.assign(context, {
    document, location, window: { ...root }, unsafeWindow: noUnsafeWindow ? undefined : root, CustomEvent, URLSearchParams,
    GM_addElement(_tag, values) {
      const element = { ...values, remove() { this.removed = true; } };
      inject(element);
      return element;
    },
  });
  return { api, context, transport, loads, captionUrl, videoId };
}

for (const options of [{}, { blockedScripts: true }, { blockedScripts: true, frozenHooks: true }]) {
  const { api, transport, captionUrl, videoId } = bridgeHarness(options);
  const snapshot = await api.captionBridgeRequest("snapshot");
  assert.equal(snapshot.videoId, videoId);
  assert.equal(await api.captionBridgeRequest("load", { url: captionUrl }), '{"events":[]}');
  assert.equal(transport.history.length, 0);
}

const { api, loads } = bridgeHarness({ blockedScripts: true });
await assert.rejects(api.captionBridgeRequest("load", { url: "https://evil.example/api/timedtext?v=abcdefghijk" }), /Invalid caption request/);
assert.equal(loads.length, 0);

const controller = new AbortController();
const cancelled = api.captionBridgeRequest("snapshot", {}, controller.signal);
controller.abort();
await assert.rejects(cancelled, (error) => error.name === "AbortError");

const blocked = bridgeHarness({ blockedScripts: true, noUnsafeWindow: true });
blocked.context.setTimeout = (callback) => setTimeout(callback, 10);
await assert.rejects(blocked.api.captionBridgeRequest("snapshot"), /caption bridge could not start/);

console.log("YouTube isolated-world bridge checks passed");
