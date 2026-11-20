import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createHarness, cacheSettings } from "./fixtures.mjs";

const { api, context, document, body, documentElement, transport } = createHarness();
const reqSettings = { ...cacheSettings, apiKey: "test", model: "fast-model" };

function makeEl(tagName, opts = {}) {
  const attrs = new Map(Object.entries(opts.attrs || {}));
  const classes = new Set(opts.classes || []);
  const el = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    display: opts.display ?? "block",
    visibility: opts.visibility ?? "visible",
    whiteSpace: opts.whiteSpace,
    position: opts.position,
    backgroundColor: opts.backgroundColor,
    backgroundImage: opts.backgroundImage,
    backdropFilter: opts.backdropFilter,
    flexDirection: opts.flexDirection,
    dataset: {},
    isConnected: true,
    parentElement: opts.parentElement || null,
    nextElementSibling: null,
    children: [],
    childNodes: [],
    ...(opts.textNodes ? { textNodes: opts.textNodes } : {}),
    innerText: opts.innerText ?? "",
    textContent: opts.textContent ?? opts.innerText ?? "",
    style: { cssText: attrs.get("style") || "", setProperty() {}, removeProperty() {} },
    classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
    set className(val) { classes.clear(); String(val || "").split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
    get className() { return [...classes].join(" "); },
    get attributes() { return [...attrs.keys()].map((name) => ({ name })); },
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, val) => attrs.set(name, String(val)),
    removeAttribute: (name) => attrs.delete(name),
    getRootNode: () => document,
    getBoundingClientRect: opts.getBoundingClientRect || (() => ({ left: 0, top: 0, width: 320, height: 80 })),
    getClientRects: opts.getClientRects || (() => [{}]),
    matches(selector) {
      return selector.split(",").map((s) => s.trim()).some((part) => {
        if (part === "*") return true;
        if (part.startsWith(".")) return classes.has(part.slice(1));
        const attr = /^\[([^\]=]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/.exec(part);
        if (attr) return attr[2] ? el.getAttribute(attr[1]) === attr[2] : el.getAttribute(attr[1]) !== null;
        return part.toLowerCase() === el.tagName.toLowerCase();
      });
    },
    closest(selector) {
      for (let cur = el; cur; cur = cur.parentElement) {
        if (cur.matches?.(selector)) return cur;
      }
      return null;
    },
    contains(node) {
      for (let cur = node; cur; cur = cur.parentElement) {
        if (cur === el) return true;
      }
      return false;
    },
    querySelector: (selector) => el.querySelectorAll(selector)[0] || null,
    querySelectorAll(selector) {
      const out = [];
      const walk = (node) => {
        for (const ch of node.children || []) {
          if (ch?.matches?.(selector)) out.push(ch);
          if (ch) walk(ch);
        }
      };
      walk(el);
      return out;
    },
    append(...items) {
      for (const item of items) {
        if (item && typeof item === "object") {
          item.parentElement = el;
          item.isConnected = true;
        }
        el.children.push(item);
        el.childNodes.push(item);
      }
    },
    replaceChildren(...items) { el.children = []; el.childNodes = []; el.append(...items); },
    cloneNode(deep = false) {
      const copy = makeEl(el.tagName, { attrs: Object.fromEntries(attrs), classes: [...classes], display: el.display });
      if (deep) {
        const clonedMap = new Map([[el, copy]]);
        for (const ch of el.children) {
          const chCopy = ch.cloneNode(true);
          copy.append(chCopy);
          clonedMap.set(ch, chCopy);
        }
        if (Array.isArray(el.textNodes)) {
          copy.textNodes = el.textNodes.map((tn) => ({ ...tn, parentElement: clonedMap.get(tn.parentElement) || copy }));
        }
      }
      return copy;
    },
    insertAdjacentElement(_pos, next) { el.nextElementSibling = next; next.isConnected = true; },
    remove() {
      el.isConnected = false;
      const idx = el.parentElement?.children?.indexOf(el) ?? -1;
      if (idx !== -1) el.parentElement.children.splice(idx, 1);
      el.parentElement = null;
    },
  };
  return el;
}

// 1. Translation response parsing: normalization, relaxed line breaks, and partial batch recovery.
assert.deepEqual([...api.parseTranslations('```json\n{"translations":["one","two"]}\n```', 2)], ["one", "two"]);
assert.throws(() => api.parseTranslations("not json", 1), /Response format mismatch/);
assert.throws(() => api.parseTranslations('{"translations":["one"]}', 2), /Expected 2 translations, received 1/);

const relaxedBreaks = api.requestTranslations(["First paragraph.\n\nSecond paragraph.", "Single line"], reqSettings);
transport.options.onload({
  status: 200,
  responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translations: ["合併後的段落。", "第一行 \r\n \r\n\n 第二行"] }) } }] }),
});
assert.deepEqual([...(await relaxedBreaks.promise)], ["合併後的段落。", "第一行\n\n第二行"]);

const partialReq = api.requestTranslations(["First", "Second"], reqSettings);
transport.options.onload({
  status: 200,
  responseText: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ translations: ["   ", "第二段"] }) } }] }),
});
await assert.rejects(partialReq.promise, (error) => {
  assert.equal(error.code, "TRANSLATION_RESPONSE_ERROR");
  assert.deepEqual([...error.partialTranslations], [null, "第二段"]);
  return true;
});

// 2. Batch recovery scheduler applies valid items immediately and skips echoed auto-page output.
{
  const items = ["Broken", "Fine", "Echoed"].map((text) => ({
    text, isConnected: true, busy: null,
    getAttribute() { return this.busy; },
    setAttribute(_n, v) { this.busy = v; },
    removeAttribute() { this.busy = null; },
  }));
  const calls = [];
  const inserted = new Map();
  const task = { autoPage: true, cancelled: false, jobs: new Set() };
  const scheduler = vm.runInNewContext(
    readFileSync(new URL("../src/text/jobs.js", import.meta.url), "utf8") + "\n({ translateElements })",
    {
      Error, Map, Set, WeakMap, clearTimeout, BATCH_MAX_CHARS: 6000,
      comparableText: (v) => String(v || "").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase(),
      readySettings: async () => reqSettings,
      loadCache: () => ({}), saveCache() {},
      sourceText: (el) => el.text,
      translationAfter: (el) => inserted.has(el),
      translationRequestFor: (_el, text) => ({ requestText: text, segmentCount: 0 }),
      hashCacheKey: (text) => text,
      groupRecords: api.groupRecords, makeBatches: api.makeBatches,
      parseInlineTranslation: api.parseInlineTranslation,
      recordMatchesElement: (record) => record.element.isConnected,
      shouldSplitBatch: api.shouldSplitBatch,
      restoreAriaBusy(job) {
        if (job.ariaBusy === null) job.element.removeAttribute("aria-busy");
        else job.element.setAttribute("aria-busy", job.ariaBusy);
      },
      showIndicator() {}, removeIndicator() {}, toast() {},
      insertTranslation(el, result) { inserted.set(el, result.translation); },
      requestTranslations(texts) {
        calls.push([...texts]);
        return {
          promise: texts.length > 1
            ? Promise.reject(Object.assign(new Error("empty item"), {
                code: "TRANSLATION_RESPONSE_ERROR",
                partialTranslations: [null, "正常譯文", "Echoed!"],
              }))
            : Promise.resolve(["重試譯文"]),
          abort() {},
        };
      },
    },
  );
  await scheduler.translateElements(items, { task });
  assert.deepEqual(calls, [["Broken", "Fine", "Echoed"], ["Broken"]]);
  assert.equal(inserted.get(items[0]), "重試譯文");
  assert.equal(inserted.get(items[1]), "正常譯文");
  assert.equal(inserted.has(items[2]), false);
}

// 3. Inline tag extraction, DOM reassembly, security filtering, and table/flex layout insertion.
const origCreateElement = document.createElement;
const origGetComputedStyle = context.getComputedStyle;
document.createElement = (tag) => makeEl(tag);
context.getComputedStyle = (el) => ({
  ...origGetComputedStyle(el),
  position: el.position || "static",
  backgroundColor: el.backgroundColor || "transparent",
  backgroundImage: el.backgroundImage || "none",
  backdropFilter: el.backdropFilter || "none",
  flexDirection: el.flexDirection || "",
  gridTemplateColumns: el.gridTemplateColumns || "",
});

try {
  const sourcePara = makeEl("p");
  const safeLink = makeEl("a", { display: "inline", attrs: { href: "https://example.com/guide", target: "_blank", onclick: "evil()" } });
  const coloredSpan = makeEl("span", { display: "inline", attrs: { style: "color: red", class: "tag" } });
  const unsafeLink = makeEl("a", { display: "inline", attrs: { href: "javascript:alert(1)" } });
  sourcePara.append(safeLink, coloredSpan, unsafeLink);
  sourcePara.textNodes = [
    { nodeValue: "Read ", parentElement: sourcePara },
    { nodeValue: "guide", parentElement: safeLink },
    { nodeValue: " by ", parentElement: sourcePara },
    { nodeValue: "Alice", parentElement: coloredSpan },
    { nodeValue: " or ", parentElement: sourcePara },
    { nodeValue: "click", parentElement: unsafeLink },
    { nodeValue: ".", parentElement: sourcePara },
  ];
  const reqInfo = api.translationRequestFor(sourcePara, api.sourceText(sourcePara));
  assert.equal(reqInfo.requestText, "Read <0>guide</0> by <1>Alice</1> or <2>click</2>.");
  const parsedRich = api.parseInlineTranslation("閱讀 <1>愛麗絲</1> 的<0>指南</0>或<2>點擊</2>。", reqInfo.segmentCount);
  api.insertTranslation(sourcePara, parsedRich);
  const inserted = sourcePara.nextElementSibling;
  assert.equal(inserted.children[1].getAttribute("style"), "color: red");
  assert.equal(inserted.children[3].getAttribute("href"), "https://example.com/guide");
  assert.equal(inserted.children[3].getAttribute("rel"), "noopener noreferrer");
  assert.equal(inserted.children[3].getAttribute("onclick"), null);
  assert.equal(inserted.children[5].getAttribute("href"), null);
  assert.equal(api.parseInlineTranslation("<0>Unbalanced <1>tag</0>", 2).segments, null);

  const tdCell = makeEl("td");
  tdCell.textNodes = [{ nodeValue: "Cell text", parentElement: tdCell }];
  api.insertTranslation(tdCell, "儲存格譯文");
  assert.equal(tdCell.nextElementSibling, null);
  assert.equal(api.translationAfter(tdCell), tdCell.children[0]);

  const flexRow = makeEl("div", { display: "flex", flexDirection: "row" });
  const flexItem = makeEl("p", { parentElement: flexRow });
  flexItem.textNodes = [{ nodeValue: "Row item", parentElement: flexItem }];
  api.insertTranslation(flexItem, "橫向項目");
  assert.equal(flexItem.nextElementSibling, null);
  assert.equal(flexItem.children.length, 1);

  // 4. Page-block filtering: Chinese skip, card exclusion, and rich-text tweetText exemption.
  const cardChild = makeEl("p", { innerText: "Nested paragraph" });
  const cardLi = makeEl("li", { innerText: "Card header and nested paragraph" });
  cardLi.append(cardChild);
  const tweetBlock = makeEl("div", {
    attrs: { "data-testid": "tweetText" },
    innerText: "First tweet line\nSecond tweet line",
  });
  const tweetInnerDiv = makeEl("div", { innerText: "Second tweet line", parentElement: tweetBlock });
  tweetBlock.append(tweetInnerDiv);
  const pageRoot = { contains: () => true };

  assert.equal(api.isTranslatablePageBlock(cardLi, [pageRoot]), false);
  assert.equal(api.isTranslatablePageBlock(tweetBlock, [pageRoot], undefined, "zh-TW"), true);
  assert.equal(api.isTranslatablePageBlock(tweetInnerDiv, [pageRoot], undefined, "zh-TW"), false);
  assert.equal(api.isTranslatablePageBlock(makeEl("p"), [pageRoot], "這是一段繁體中文的評論內容。", "zh-TW"), false);
  assert.equal(api.isTranslatablePageBlock(makeEl("p"), [pageRoot], "利用規約", "zh-TW"), true);

  // 5. Gestures and Twitter swipe targeting.
  assert.equal(api.swipeIntent(16, 12), "horizontal");
  assert.equal(api.swipeIntent(10, 24), "cancel");
  assert.equal(api.swipeShouldCommit(60, -0.2), true);
  assert.equal(api.swipeShouldCommit(30, 0.4), true);
  assert.equal(api.swipeShouldCommit(20, 0.8), false);

  // 5a. Rich-text tweetText with nested block/flex children still resolves to tweetText.
  assert.equal(api.swipeElementFor(tweetInnerDiv), tweetBlock);

  // 5b. Wrapper div around a single inline tweetText (swiping blank area next to short lines) resolves to tweetText.
  const tweetWrap = makeEl("div", { innerText: "Short tweet line" });
  const inlineTweet = makeEl("div", {
    display: "inline",
    attrs: { "data-testid": "tweetText" },
    innerText: "Short tweet line",
  });
  tweetWrap.append(inlineTweet);
  assert.equal(api.swipeElementFor(tweetWrap), inlineTweet);

  // Container with additional non-tweet text still returns null so broad wrappers aren't selected.
  const multiTweetWrap = makeEl("div", { innerText: "Short tweet line and timestamp" });
  multiTweetWrap.append(inlineTweet);
  assert.equal(api.swipeElementFor(multiTweetWrap), null);

  // 5c. Overlay piercing: empty positioned <a> card link (>= 40x24) without stretched-link class & sheer covers pierce; blur blocks.
  const cardHeadline = makeEl("h3", { innerText: "Article card title" });
  const rnwCardLink = makeEl("a", {
    position: "absolute",
    innerText: "",
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
  });
  document.elementsFromPoint = () => [rnwCardLink, cardHeadline, body];
  assert.equal(api.resolveTargetElement(rnwCardLink, { clientX: 50, clientY: 50 }), cardHeadline);
  const sheerCover = makeEl("div", {
    position: "absolute",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    backgroundImage: "linear-gradient(to top, rgba(0, 0, 0, 0.3), transparent)",
    innerText: "",
    parentElement: makeEl("div", { getBoundingClientRect: () => ({ width: 300, height: 180 }) }),
    getBoundingClientRect: () => ({ width: 300, height: 180 }),
  });
  document.elementsFromPoint = () => [sheerCover, cardHeadline, body];
  assert.equal(api.resolveTargetElement(sheerCover, { clientX: 50, clientY: 50 }), cardHeadline);
  sheerCover.backdropFilter = "blur(8px)";
  assert.equal(api.resolveTargetElement(sheerCover, { clientX: 50, clientY: 50 }), sheerCover);
  delete document.elementsFromPoint;

  // 5d. Tweet inside a clickable <button> swipes; standalone <button> stays blocked; interrupted fourFinger does not stick.
  const cardBtn = makeEl("button", { innerText: "Short tweet line" });
  const btnTweet = makeEl("div", { attrs: { "data-testid": "tweetText" }, innerText: "Short tweet line" });
  cardBtn.append(btnTweet);
  const plainBtn = makeEl("button", { innerText: "Follow" });

  // Simulate an interrupted 4-finger touch (no final touchend).
  api.onTouchStart({
    target: btnTweet,
    touches: [0, 1, 2, 3].map((id) => ({ identifier: id, clientX: 50 + id * 20, clientY: 50 })),
  });
  // Next 1-finger touch on a tweet inside <button> clears fourFinger and triggers horizontal swipe.
  let prevented = false;
  api.onTouchStart({ target: btnTweet, touches: [{ identifier: 9, clientX: 40, clientY: 50 }] });
  api.onTouchMove({
    cancelable: true,
    preventDefault() { prevented = true; },
    touches: [{ identifier: 9, clientX: 80, clientY: 50 }],
  });
  assert.equal(prevented, true);
  api.resetTouches();

  // Standalone button must not start a swipe.
  prevented = false;
  api.onTouchStart({ target: plainBtn, touches: [{ identifier: 10, clientX: 40, clientY: 50 }] });
  api.onTouchMove({
    cancelable: true,
    preventDefault() { prevented = true; },
    touches: [{ identifier: 10, clientX: 90, clientY: 50 }],
  });
  assert.equal(prevented, false);
  api.resetTouches();

  // 5e. Horizontal scroll containers yield only when actually scrolled away from leading edge.
  const scroller = Object.assign(makeEl("div"), { overflowX: "auto", clientWidth: 320, scrollWidth: 640, scrollLeft: 80, parentElement: body });
  const cell = makeEl("td", { parentElement: scroller });
  assert.equal(api.canConsumeRightSwipe(cell), true);
  scroller.scrollLeft = 0;
  assert.equal(api.canConsumeRightSwipe(cell), false);
  document.scrollingElement = documentElement;
  Object.assign(documentElement, { overflowX: "auto", clientWidth: 320, scrollWidth: 640, scrollLeft: 80 });
  assert.equal(api.canConsumeRightSwipe(makeEl("p", { parentElement: documentElement })), false);
} finally {
  document.createElement = origCreateElement;
  context.getComputedStyle = origGetComputedStyle;
}
