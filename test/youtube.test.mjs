import assert from "node:assert/strict";
import { createHarness, cacheSettings } from "./fixtures.mjs";

const { youtubeApi: api, youtubeSource, context, transport, storage } = createHarness();
const plain = (value) => JSON.parse(JSON.stringify(value));
const settings = api.cleanSettings({ ...cacheSettings, apiFormat: "chat-completions", apiKey: "synthetic-subtitle-secret" });
const json3 = (events) => JSON.stringify({ events });
const event = (start, duration, text, extra = {}) => ({ tStartMs: start, dDurationMs: duration, segs: [{ utf8: text }], ...extra });
const reply = (options, groups) => options.onload({ status: 200, responseText: JSON.stringify({
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ groups }) } }],
}) });

assert.match(youtubeSource, /@run-at\s+document-start/);
assert.doesNotMatch(youtubeSource, /@match\s+\*:\/\/\*\/\*/);
assert.equal(api.youtubeVideoId("https://m.youtube.com/watch?v=abcdefghijk"), "abcdefghijk");
assert.equal(api.youtubeVideoId("https://www.youtube.com/shorts/abcdefghijk"), null);
assert.equal(api.youtubeVideoId("https://www.youtube.com/watch?v=bad"), null);

const raw = api.parseYoutubeCaptions(json3([
  { tStartMs: 0, segs: [] },
  { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "When", tOffsetMs: 0 }, { utf8: " we", tOffsetMs: 500 }, { utf8: " arrived", tOffsetMs: 1000 }] },
  event(2000, 1000, "arrived"),
  event(3000, 1800, "we sat down."),
  event(7000, 1500, "Again."), event(10000, 1500, "Again."),
]));
assert.deepEqual(plain(raw), [
  { start: 1000, end: 1500, text: "When" }, { start: 1500, end: 2000, text: "we" },
  { start: 2000, end: 3000, text: "arrived" }, { start: 3000, end: 4800, text: "we sat down." },
  { start: 7000, end: 8500, text: "Again." }, { start: 10000, end: 11500, text: "Again." },
]);
assert.equal(api.joinCaptionText(raw.slice(0, 4)), "When we arrived we sat down.");
assert.equal(api.joinCaptionText([{ text: "你好" }, { text: "世界" }, { text: "。" }]), "你好世界。");
assert.deepEqual(plain(api.ruleSubtitleGroups(raw, true)), [{ from: 0, to: 3 }, { from: 4, to: 4 }, { from: 5, to: 5 }]);
assert.equal(api.ruleSubtitleGroups(raw, false).length, raw.length);
assert.deepEqual(plain(api.parseYoutubeCaptions(json3([
  { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "Hello", tOffsetMs: 0 }, { utf8: " world.", tOffsetMs: 500 }] },
]), false)), [{ start: 1000, end: 3000, text: "Hello world." }], "Human captions must retain their existing cue boundaries");
assert.deepEqual(plain(api.parseYoutubeCaptions(json3([
  event(1000, 2000, "A rolling"), event(1000, 2500, "A rolling update."),
]))), [{ start: 1000, end: 3500, text: "A rolling update." }]);
for (const invalid of ["", "<html>error</html>", "{}", json3([event(-1, 1000, "Bad")]), json3([event(0, 0, "Bad")]),
  json3([{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: "Bad", tOffsetMs: -10 }] }])]) {
  assert.throws(() => api.parseYoutubeCaptions(invalid));
}
assert.throws(() => api.makeSubtitleChunks([{ start: 0, end: 1000, text: "x".repeat(6001) }], false), /too long/);

const chunk = api.makeSubtitleChunks(raw.slice(0, 4), true)[0];
const groups = [{ from: 0, to: 3, translation: "我們到達後便坐下。" }];
const translated = api.parseSubtitleGroups(JSON.stringify({ groups }), chunk, true);
assert.equal(translated[0].start, 1000);
assert.equal(translated[0].end, 4800);
assert.equal(translated[0].text, "When we arrived we sat down.");
for (const invalid of [[], [{ from: 1, to: 3, translation: "漏字" }], [{ from: 0, to: 2, translation: "漏尾" }],
  [{ from: 0, to: 4, translation: "越界" }], [{ from: 0.5, to: 3, translation: "小數" }],
  [{ from: 0, to: 1, translation: "重複" }, { from: 1, to: 3, translation: "重複" }], [{ from: 0, to: 3, translation: " " }]]) {
  assert.throws(() => api.parseSubtitleGroups(JSON.stringify({ groups: invalid }), chunk, true), (error) => error.code === "SUBTITLE_SEGMENTATION_ERROR");
}
const silent = api.makeSubtitleChunks(raw, true)[0];
assert.throws(() => api.parseSubtitleGroups({ groups: [{ from: 0, to: 5, translation: "跨越停頓" }] }, silent, true), /reading limit|silence/);
const manual = api.makeSubtitleChunks(raw.slice(0, 4), false)[0];
assert.throws(() => api.parseSubtitleGroups({ groups }, manual, true), /fixed subtitle/);
assert.notEqual(api.subtitleCacheKey(chunk, settings, true), api.subtitleCacheKey(chunk, settings, false));
assert.notEqual(api.subtitleCacheKey(chunk, settings, true), api.subtitleCacheKey({ ...chunk, context: "Different context." }, settings, true));
assert.equal(api.subtitleCacheKey(chunk, settings, true), api.subtitleCacheKey({ ...chunk,
  fragments: chunk.fragments.map((fragment) => ({ ...fragment, start: fragment.start + 90000, end: fragment.end + 90000 })),
}, settings, true));

const videoId = "abcdefghijk";
const baseUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr`;
const track = { baseUrl, languageCode: "en", kind: "asr", vssId: "a.en" };
const snapshot = { videoId, tracks: [track], selected: { vssId: "a.en" },
  audioUrls: [baseUrl + "&pot=correct-token&potc=1"], observedUrls: [baseUrl.replace(videoId, "otherVideo1") + "&pot=wrong-token"] };
assert.equal(api.selectYoutubeTrack(snapshot), track);
const url = new URL(api.youtubeCaptionUrl(track, snapshot));
assert.equal(url.searchParams.get("pot"), "correct-token");
assert.equal(url.searchParams.get("fmt"), "json3");
assert.equal(new URL(api.youtubeCaptionUrl(track, { ...snapshot, observedUrls: [baseUrl + "&pot=observed-token&cver=observed-client"] })).searchParams.get("pot"), "observed-token");
assert.throws(() => api.youtubeCaptionUrl({ ...track, baseUrl: "https://evil.example/api/timedtext?v=" + videoId }, snapshot), /Invalid/);
assert.throws(() => api.youtubeCaptionUrl({ ...track, baseUrl: baseUrl + "&tlang=fr" }, snapshot), /Invalid/);

const request = api.requestSubtitleTranslation(chunk, settings, true);
const payload = JSON.parse(transport.options.data);
assert.equal(transport.options.anonymous, true);
assert.doesNotMatch(payload.messages[1].content, /youtube\.com|abcdefghijk|synthetic-subtitle-secret/);
assert.doesNotMatch(payload.messages[1].content, /"start"|"end"/);
assert.equal(payload.response_format.json_schema.name, "youtube_subtitles");
reply(transport.options, groups);
assert.equal((await request.promise)[0].translation, groups[0].translation);

const makeSession = (chunks) => ({
  video: { currentTime: 1.5, playbackRate: 1 }, player: { classList: { contains: () => false } },
  chunks, settings, preferences: { smart: true }, generation: 0, running: false,
  controller: new AbortController(),
});
delete storage["youtube-cache-v1"];
const session = makeSession(api.makeSubtitleChunks(raw.slice(0, 4), true));
api.setSession(session);
const pumping = api.pumpSubtitleQueue(session);
reply(transport.options, [{ from: 0, to: 2, translation: "Invalid partial translation" }]);
for (let i = 0; i < 10; i++) await Promise.resolve();
assert.ok(JSON.parse(transport.options.data).messages[1].content.includes("fixedGroups"), "Invalid AI segmentation must fall back to deterministic boundaries");
reply(transport.options, groups);
await pumping;
assert.equal(session.chunks[0].done, true);
const cache = storage["youtube-cache-v1"];
assert.equal(Object.keys(cache).length, 1);
assert.doesNotMatch(JSON.stringify(cache), /When|arrived|youtube\.com|synthetic-subtitle-secret|"start"|"end"/);

const priorRequests = transport.history.length;
const cached = makeSession(api.makeSubtitleChunks(raw.slice(0, 4), true));
api.setSession(cached);
await api.pumpSubtitleQueue(cached);
assert.equal(cached.chunks[0].done, true);
assert.equal(transport.history.length, priorRequests, "Replaying a translated chunk must use local cache");

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
assert.equal(storage["youtube-cache-v1"], undefined, "A late result after seeking must neither render nor enter cache");

const failing = makeSession(api.makeSubtitleChunks(raw.slice(0, 4), true));
api.setSession(failing);
const failed = api.pumpSubtitleQueue(failing);
transport.options.onload({ status: 401, responseText: '{"error":{"message":"bad synthetic-subtitle-secret"}}' });
await failed;
assert.equal(failing.chunks[0].failed, true);
assert.equal(storage["youtube-cache-v1"], undefined);
assert.doesNotMatch(failing.error.message, /synthetic-subtitle-secret/);
const failedCount = transport.history.length;
await api.pumpSubtitleQueue(failing);
assert.equal(transport.history.length, failedCount, "Provider failures must wait for manual Retry");

const far = api.makeSubtitleChunks(Array.from({ length: 100 }, (_, index) => ({ start: index * 4000, end: index * 4000 + 3000, text: "A complete sentence." })), false);
const bounded = makeSession(far);
bounded.chunks.forEach((entry) => { entry.done = entry.start < 65000; });
assert.equal(api.subtitleQueueChunk(bounded), undefined, "Prefetch must not send the entire remaining transcript");
bounded.video.playbackRate = 2;
assert.ok(api.subtitleQueueChunk(bounded));
assert.equal(api.subtitleAtTime(session.chunks, 1000).translation, groups[0].translation);
assert.equal(api.subtitleAtTime(session.chunks, 4800), null);
assert.equal(api.loadSubtitlePreferences().enabled, true, "Bilingual subtitles must be enabled by default");
assert.equal(api.subtitleTrackText({ text: "Source", translation: "譯文" }, { translationOnly: true }), "譯文");
assert.equal(api.subtitleTrackText({ text: "Source" }, { translationOnly: true }), "Source");

const resilient = api.parseYoutubeCaptions(json3([
  event(0, 0, "Zero duration marker"),
  { tStartMs: 1000, segs: [{ utf8: "Inferred duration." }] },
  { tStartMs: 2500, dDurationMs: 1500, segs: [{ utf8: "Bad offset", tOffsetMs: -5 }, { utf8: "Kept word", tOffsetMs: 200 }] },
]));
assert.deepEqual(plain(resilient), [
  { start: 1000, end: 2500, text: "Inferred duration." },
  { start: 2700, end: 4000, text: "Kept word" },
], "Single malformed ASR events or offsets must be skipped or repaired without rejecting the whole track");

const unpunctuatedAsr = [
  { start: 0, end: 1200, text: "first clause words" },
  { start: 1200, end: 2400, text: "continuing smoothly" },
  { start: 2400, end: 3600, text: "past three seconds" },
  { start: 4100, end: 5200, text: "after a half second breath" },
];
assert.deepEqual(plain(api.ruleSubtitleGroups(unpunctuatedAsr, true)), [
  { from: 0, to: 2 }, { from: 3, to: 3 },
], "ASR rule grouping must split at natural breathing pauses once a clause is long enough");

const tolerantChunk = api.makeSubtitleChunks([
  { start: 0, end: 4500, text: "a".repeat(95) },
  { start: 5600, end: 8600, text: "b".repeat(95) },
], true)[0];
const tolerantGroups = api.parseSubtitleGroups({ groups: [{ from: 0, to: 1, translation: "自然長句不誤殺。" }] }, tolerantChunk, true);
assert.equal(tolerantGroups.length, 1, "Smart segmentation validator must tolerate minor length/pause overrun within hard limits");

const zhTwTrack = { baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=zh-TW`, languageCode: "zh-TW", kind: "", vssId: ".zh-TW" };
const zhCnTrack = { baseUrl: `https://www.youtube.com/api/timedtext?v=${videoId}&lang=zh-CN`, languageCode: "zh-CN", kind: "", vssId: ".zh-CN" };
const bilingualSnapshot = { videoId, tracks: [track, zhTwTrack], selected: { languageCode: "zh-TW", kind: "", vssId: ".zh-TW" }, defaultIndex: 0 };
assert.equal(api.selectYoutubeTrack(bilingualSnapshot, "zh-TW"), track, "Source track selection must avoid picking the target language when an original track exists");
assert.equal(api.selectTargetYoutubeTrack(bilingualSnapshot, track, "zh-TW"), zhTwTrack, "Target track selection must match an existing human subtitle track in the target language");
assert.equal(api.selectTargetYoutubeTrack({ videoId, tracks: [track, zhCnTrack] }, track, "zh-TW"), null, "Simplified Chinese tracks must not be treated as native zh-TW tracks");
assert.equal(
  new URL(api.youtubeCaptionUrl(track, { ...snapshot, observedUrls: [baseUrl + "&tlang=zh-Hant&pot=tlang-observed-token"] })).searchParams.get("pot"),
  "tlang-observed-token",
  "Observed auto-translated URLs must still contribute their pot token while stripping tlang",
);

const mergedChunks = api.mergeBilingualCaptions(raw.slice(0, 4), [
  { start: 1000, end: 2900, text: "當我們到達時，" },
  { start: 2900, end: 4800, text: "便坐了下來。" },
], true);
assert.equal(mergedChunks[0].done, true);
assert.deepEqual(plain(mergedChunks[0].groups), [
  { from: 0, to: 2, start: 1000, end: 3000, text: "When we arrived", translation: "當我們到達時，" },
  { from: 3, to: 3, start: 3000, end: 4800, text: "we sat down.", translation: "便坐了下來。" },
], "Native bilingual merging must align ASR words to human target cues without API calls");

api.setSession(null);
console.log("YouTube subtitle checks passed");
