  function joinCaptionText(fragments) {
    return fragments.reduce((text, fragment) => {
      const next = fragment.text;
      const noSpace = !text || /^[,.!?;:，。！？；：、…)'’\]}]/u.test(next) ||
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(text) &&
        /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(next);
      return text + (noSpace ? "" : " ") + next;
    }, "");
  }

  function parseYoutubeCaptions(text, automatic = true) {
    if (typeof text !== "string" || text.length > CAPTION_MAX_BYTES) throw new Error("YouTube captions are too large or invalid.");
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error("YouTube returned no usable captions. Start playback, turn on CC, and try again."); }
    if (!Array.isArray(data?.events) || data.events.length > 100000) throw new Error("Invalid YouTube caption events.");
    const fragments = [];
    const seen = new Map();
    for (const event of data.events) {
      if (!Array.isArray(event?.segs) || !event.segs.some((seg) => typeof seg?.utf8 === "string" && seg.utf8.trim())) continue;
      if (!Number.isFinite(event.tStartMs) || event.tStartMs < 0 ||
        !Number.isFinite(event.dDurationMs) || event.dDurationMs <= 0) throw new Error("Invalid YouTube caption timing.");
      const pieces = [];
      for (const seg of event.segs) {
        if (typeof seg?.utf8 !== "string") throw new Error("Invalid YouTube caption text.");
        if (!seg.utf8.trim()) continue;
        const offset = automatic ? seg.tOffsetMs ?? 0 : 0;
        if (!Number.isFinite(offset) || offset < 0 || offset >= event.dDurationMs) throw new Error("Invalid YouTube word timing.");
        const last = pieces.at(-1);
        if (last?.offset === offset) last.text += seg.utf8;
        else pieces.push({ offset, text: seg.utf8 });
      }
      pieces.forEach((piece, index) => {
        const content = normalizeText(piece.text);
        if (!content) return;
        const start = event.tStartMs + piece.offset;
        const end = event.tStartMs + (pieces[index + 1]?.offset ?? event.dDurationMs);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid YouTube word order.");
        const key = `${start}\u0000${content}`;
        if (seen.has(key)) {
          seen.get(key).end = Math.max(seen.get(key).end, end);
          return;
        }
        const fragment = { start, end, text: content };
        seen.set(key, fragment);
        fragments.push(fragment);
        if (fragments.length > CAPTION_MAX_FRAGMENTS) throw new Error("This caption track has too many fragments.");
      });
    }
    fragments.sort((a, b) => a.start - b.start);
    const combined = [];
    for (const fragment of fragments) {
      const last = combined.at(-1);
      if (last?.start === fragment.start) {
        if (fragment.text.startsWith(last.text)) last.text = fragment.text;
        else if (!last.text.startsWith(fragment.text)) last.text = joinCaptionText([last, fragment]);
        last.end = Math.max(last.end, fragment.end);
      } else combined.push({ ...fragment });
    }
    combined.forEach((fragment, index) => {
      const next = combined[index + 1];
      if (next && fragment.end > next.start) fragment.end = next.start;
    });
    const valid = combined.filter((fragment) => fragment.end > fragment.start);
    if (!valid.length) throw new Error("This video has no usable captions.");
    return valid;
  }

  function ruleSubtitleGroups(fragments, automatic) {
    const groups = [];
    for (let index = 0; index < fragments.length; index++) {
      const last = groups.at(-1);
      const fragment = fragments[index];
      const previous = fragments[index - 1];
      if (automatic && last && fragment.end - fragments[last.from].start <= SUBTITLE_MAX_MS &&
        fragment.start - previous.end <= SUBTITLE_PAUSE_MS &&
        !/[.!?。！？…]["'’”)]?$/u.test(previous.text) &&
        joinCaptionText(fragments.slice(last.from, index + 1)).length <= SUBTITLE_MAX_CHARS) {
        last.to = index;
      } else groups.push({ from: index, to: index });
    }
    return groups;
  }

  function subtitleGroupsFromRanges(ranges, fragments) {
    return ranges.map((range) => ({
      ...range,
      start: fragments[range.from].start,
      end: fragments[range.to].end,
      text: joinCaptionText(fragments.slice(range.from, range.to + 1)),
    }));
  }

  function makeSubtitleChunks(fragments, automatic) {
    const chunks = [];
    let chunk = null;
    for (const group of ruleSubtitleGroups(fragments, automatic)) {
      const entries = fragments.slice(group.from, group.to + 1);
      const chars = entries.reduce((sum, fragment) => sum + fragment.text.length, 0);
      if (chars > SUBTITLE_BATCH_CHARS) throw new Error("A subtitle cue is too long to translate safely.");
      if (!chunk || entries.at(-1).end - chunk.start > SUBTITLE_BATCH_MS ||
        chunk.chars + chars > SUBTITLE_BATCH_CHARS || chunk.fragments.length + entries.length > 180) {
        chunk = { start: entries[0].start, end: entries.at(-1).end, chars: 0, fragments: [], automatic, done: false, failed: false, rawFrom: group.from };
        chunks.push(chunk);
      }
      chunk.fragments.push(...entries);
      chunk.chars += chars;
      chunk.end = entries.at(-1).end;
    }
    chunks.forEach((entry, index) => {
      entry.context = joinCaptionText(fragments.slice(Math.max(0, entry.rawFrom - 30), entry.rawFrom)
        .filter((fragment) => fragment.end > entry.start - 5000));
      entry.groups = subtitleGroupsFromRanges(ruleSubtitleGroups(entry.fragments, automatic), entry.fragments);
      entry.index = index;
    });
    return chunks;
  }

  function parseSubtitleGroups(content, chunk, smart) {
    const fail = (reason) => {
      const error = responseFormatError(reason, content);
      error.code = "SUBTITLE_SEGMENTATION_ERROR";
      throw error;
    };
    let value;
    try { value = typeof content === "string" ? JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) : content; }
    catch { fail("The subtitle response is not valid JSON."); }
    const groups = value?.groups;
    const { fragments } = chunk;
    const fixed = ruleSubtitleGroups(fragments, chunk.automatic);
    if (!Array.isArray(groups) || !groups.length || groups.length > fragments.length) fail("Invalid subtitle group count.");
    let next = 0;
    groups.forEach((group, index) => {
      if (!Number.isInteger(group?.from) || !Number.isInteger(group.to) || group.from !== next ||
        group.to < group.from || group.to >= fragments.length) fail("Subtitle groups must cover every fragment exactly once in order.");
      if (typeof group.translation !== "string" || !group.translation.trim() || group.translation.length > 12000) fail("A subtitle translation is empty or too long.");
      if ((!smart || !chunk.automatic) && (fixed[index]?.from !== group.from || fixed[index]?.to !== group.to)) fail("The translation changed a fixed subtitle boundary.");
      if (group.to > group.from) {
        if (fragments[group.to].end - fragments[group.from].start > SUBTITLE_MAX_MS ||
          joinCaptionText(fragments.slice(group.from, group.to + 1)).length > SUBTITLE_MAX_CHARS) fail("A subtitle group exceeds the reading limit.");
        for (let i = group.from + 1; i <= group.to; i++) {
          if (fragments[i].start - fragments[i - 1].end > SUBTITLE_PAUSE_MS) fail("A subtitle crosses a long silence.");
        }
      }
      next = group.to + 1;
    });
    if (next !== fragments.length) fail("The subtitle response omitted the end of the batch.");
    return subtitleGroupsFromRanges(groups.map(({ from, to, translation }) => ({ from, to, translation: translation.trim() })), fragments);
  }

  function subtitleCacheKey(chunk, settings, smart) {
    return translationCacheKey(JSON.stringify({
      fragments: chunk.fragments.map((fragment, index) => [fragment.text, fragment.end - fragment.start,
        index ? fragment.start - chunk.fragments[index - 1].end : 0]),
      context: chunk.context,
    }), settings, `youtube-v1-${chunk.automatic}-${smart}`);
  }

  function requestSubtitleTranslation(chunk, settings, smart) {
    const fixed = ruleSubtitleGroups(chunk.fragments, chunk.automatic);
    const systemPrompt = [
      translationRulesFor(settings.targetLanguage),
      "Translate these video captions. Input IDs are local fragment indexes, not timestamps.",
      smart && chunk.automatic
        ? `Group consecutive fragments into natural sentences or clauses before translating. Each group must span at most ${SUBTITLE_MAX_MS} milliseconds and ${SUBTITLE_MAX_CHARS} source characters; an individually longer fragment must remain alone. Never group across a gap over ${SUBTITLE_PAUSE_MS} milliseconds.`
        : "Keep exactly the supplied fixedGroups boundaries; translate each complete group using the neighboring groups as context.",
      "Use every input ID exactly once, in order, without omissions or overlaps. Return only groups with inclusive integer from/to IDs and a nonempty translation. Do not return timestamps or rewrite the original captions.",
      "context is read-only context; never translate it as an additional group.",
    ].join(" ");
    const userContent = JSON.stringify({
      context: chunk.context,
      fragments: chunk.fragments.map((fragment, id) => ({ id, text: fragment.text,
        durationMs: fragment.end - fragment.start, gapBeforeMs: id ? fragment.start - chunk.fragments[id - 1].end : 0 })),
      ...(!smart || !chunk.automatic ? { fixedGroups: fixed } : {}),
    });
    return sendProviderRequest(settings, {
      schemaName: "youtube_subtitles", systemPrompt, userContent,
      geminiParts: [{ text: userContent }],
      parseResponse: (content) => parseSubtitleGroups(content, chunk, smart),
      schema: {
        type: "object", properties: {
          groups: { type: "array", minItems: 1, maxItems: chunk.fragments.length, items: {
            type: "object", properties: {
              from: { type: "integer" }, to: { type: "integer" }, translation: { type: "string" },
            }, required: ["from", "to", "translation"], additionalProperties: false,
          } },
        }, required: ["groups"], additionalProperties: false,
      },
    });
  }
