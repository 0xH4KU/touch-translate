import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHarness, cacheSettings } from "./fixtures.mjs";

const { youtubeApi: api, context, transport, storage } = createHarness();
const plain = (value) => JSON.parse(JSON.stringify(value));
const settings = api.cleanSettings({ ...cacheSettings, apiFormat: "chat-completions", apiKey: "synthetic-subtitle-secret" });
const json3 = (events) => JSON.stringify({ events });
const event = (start, duration, text, extra = {}) => ({ tStartMs: start, dDurationMs: duration, segs: [{ utf8: text }], ...extra });
const reply = (options, groups) => options.onload({
  status: 200,
  responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ groups }) } }] }),
});

// 1. Video ID & caption parsing (ASR offsets, malformed event resilience, human line breaks).
assert.equal(api.youtubeVideoId("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
assert.equal(api.youtubeVideoId("https://www.youtube.com/shorts/abcdefghijk"), null);

const raw = api.parseYoutubeCaptions(json3([
  event(0, 0, "Zero duration"),
  { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "When", tOffsetMs: 0 }, { utf8: " we", tOffsetMs: 500 }, { utf8: " arrived", tOffsetMs: 1000 }] },
  event(3000, 1800, "we sat down."),
  event(7000, 1500, "Again."),
]));
assert.deepEqual(plain(raw), [
  { start: 1000, end: 1500, text: "When" },
  { start: 1500, end: 2000, text: "we" },
  { start: 2000, end: 3000, text: "arrived" },
  { start: 3000, end: 4800, text: "we sat down." },
  { start: 7000, end: 8500, text: "Again." },
]);
assert.equal(api.parseYoutubeCaptions(json3([event(1000, 2000, "- Really?\n- Yes!")]), false)[0].text, "- Really?\n- Yes!");
assert.equal(api.joinCaptionText(raw.slice(0, 4)), "When we arrived we sat down.");
assert.equal(api.joinCaptionText([{ text: "你好" }, { text: "世界" }]), "你好世界");
assert.throws(() => api.parseYoutubeCaptions("<html>error</html>"));

// 2. Subtitle grouping, segmentation validation, and native bilingual merging.
const chunk = api.makeSubtitleChunks(raw.slice(0, 4), true)[0];
const groups = [{ from: 0, to: 3, translation: "我們到達後便坐下。" }];
assert.equal(api.parseSubtitleGroups(JSON.stringify({ groups }), chunk, true)[0].end, 4800);
assert.throws(
  () => api.parseSubtitleGroups(JSON.stringify({ groups: [{ from: 0, to: 2, translation: "漏尾" }] }), chunk, true),
  (error) => error.code === "SUBTITLE_SEGMENTATION_ERROR",
);
const silent = api.makeSubtitleChunks(raw, true)[0];
assert.throws(() => api.parseSubtitleGroups({ groups: [{ from: 0, to: 4, translation: "跨停頓" }] }, silent, true), /reading limit|silence/);

const videoId = "abcdefghijk";
const baseUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`;
const track = { baseUrl, languageCode: "en", kind: "asr", vssId: "a.en" };
const zhTwTrack = { baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=zh-TW`, languageCode: "zh-TW", kind: "", vssId: ".zh-TW" };
const snapshot = { videoId, tracks: [track, zhTwTrack], audioUrls: [`${baseUrl}&pot=tok1`], observedUrls: [] };

assert.equal(api.selectYoutubeTrack(snapshot, "zh-TW"), track);
assert.equal(api.selectTargetYoutubeTrack(snapshot, track, "zh-TW"), zhTwTrack);
assert.equal(api.selectTargetYoutubeTrack(snapshot, track, "zh-TW", true), null);
assert.equal(new URL(api.youtubeCaptionUrl(track, snapshot)).searchParams.get("pot"), "tok1");
assert.throws(() => api.youtubeCaptionUrl({ ...track, baseUrl: `${baseUrl}&tlang=fr` }, snapshot), /Invalid/);

const merged = api.mergeBilingualCaptions(raw.slice(0, 4), [
  { start: 1000, end: 2900, text: "當我們到達時，" },
  { start: 2900, end: 4800, text: "便坐了下來。" },
], true);
assert.deepEqual(plain(merged[0].groups), [
  { from: 0, to: 2, start: 1000, end: 3000, text: "When we arrived", translation: "當我們到達時，" },
  { from: 3, to: 3, start: 3000, end: 4800, text: "we sat down.", translation: "便坐了下來。" },
]);

// 3. Translation queue: smart fallback to fixedGroups, caching, seek cancellation, and backoff retry.
const makeSession = (chunks) => ({
  video: { currentTime: 1.5, playbackRate: 1 },
  player: { classList: { contains: () => false } },
  chunks, settings, preferences: { smart: true }, generation: 0, running: false,
  controller: new AbortController(),
});

delete storage["youtube-cache-v1"];
const session = makeSession(api.makeSubtitleChunks(raw.slice(0, 4), true));
api.setSession(session);
const pumping = api.pumpSubtitleQueue(session);
reply(transport.options, [{ from: 0, to: 2, translation: "Bad split" }]);
for (let i = 0; i < 10; i++) await Promise.resolve();
assert.ok(JSON.parse(transport.options.data).messages[1].content.includes("fixedGroups"));
reply(transport.options, groups);
await pumping;
assert.equal(session.chunks[0].done, true);

// Replaying cached chunk uses local storage without calling API.
const reqBeforeCache = transport.history.length;
const cachedSession = makeSession(api.makeSubtitleChunks(raw.slice(0, 4), true));
api.setSession(cachedSession);
await api.pumpSubtitleQueue(cachedSession);
assert.equal(transport.history.length, reqBeforeCache);

// Cancelled seek drops late response.
delete storage["youtube-cache-v1"];
const seeking = makeSession(api.makeSubtitleChunks(raw.slice(0, 4), true));
api.setSession(seeking);
const inFlight = api.pumpSubtitleQueue(seeking);
const late = transport.options;
api.cancelSubtitleRequest(seeking);
seeking.video.currentTime = 1000;
reply(late, groups);
await inFlight;
assert.equal(seeking.chunks[0].done, false);

// Provider error schedules backoff retry and redacts secrets.
delete storage["youtube-cache-v1"];
const failing = { ...makeSession(api.makeSubtitleChunks(raw.slice(0, 3), true)), retryBaseMs: 20 };
api.setSession(failing);
const failRun = api.pumpSubtitleQueue(failing);
transport.options.onload({ status: 401, responseText: '{"error":{"message":"bad synthetic-subtitle-secret"}}' });
await failRun;
assert.equal(failing.chunks[0].failed, true);
assert.equal(failing.retryCount, 1);
assert.doesNotMatch(failing.error.message, /synthetic-subtitle-secret/);

// 4. Auto-start skips same-language Chinese videos unless forceAi is enabled.
{
  const zhSnapshot = { videoId, tracks: [{ baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=zh-CN`, languageCode: "zh-CN", kind: "", vssId: ".zh-CN" }] };
  const autoCalls = [];
  const sandbox = vm.runInNewContext(
    `${readFileSync(new URL("../src/shared/utils.js", import.meta.url), "utf8")}
    ${readFileSync(new URL("../src/youtube/config.js", import.meta.url), "utf8")}
    ${readFileSync(new URL("../src/youtube/jobs.js", import.meta.url), "utf8")}
    ({ startYoutubeSubtitles, getSession: () => subtitleSession, setView: (v) => { subtitleView = v; } })`,
    {
      AbortController, URL, clearTimeout, setTimeout,
      GM_getValue: (_k, d) => d,
      loadSettings: () => settings,
      requireReadySettings: (s) => s,
      youtubeVideoId: () => videoId,
      captionBridgeRequest: async (action) => action === "snapshot" ? zhSnapshot : null,
      selectYoutubeTrack: api.selectYoutubeTrack,
      selectTargetYoutubeTrack: api.selectTargetYoutubeTrack,
      sameLanguage: api.sameLanguage,
      setSubtitleStatus() {},
      cancelledError: () => Object.assign(new Error("cancelled"), { name: "AbortError" }),
      requestSubtitleTranslation: () => { autoCalls.push(1); return { promise: Promise.resolve([]), abort() {} }; },
    },
  );
  sandbox.setView({
    player: { classList: { add() {}, remove() {}, contains: () => false }, style: {} },
    video: { currentTime: 0, playbackRate: 1, paused: true, addEventListener() {}, removeEventListener() {} },
    trigger: { dataset: {} }, toggle: { textContent: "", setAttribute() {} }, status: { dataset: {} },
    retry: {}, captions: {}, source: {}, translation: {}, host: { dataset: {} },
    preferences: { enabled: true, smart: true, forceAi: false, translationOnly: false },
  });
  await sandbox.startYoutubeSubtitles(true);
  assert.equal(sandbox.getSession(), null);
  assert.equal(autoCalls.length, 0);
}

api.setSession(null);
void context;
console.log("YouTube subtitle checks passed");
