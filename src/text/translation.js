  function shouldSplitBatch(error) {
    return error?.code === "TRANSLATION_RESPONSE_ERROR";
  }

  function hashCacheKey(text, settings) {
    return translationCacheKey(text, settings, "prompt-v5");
  }

  function makeBatches(records, prioritizeFirst = false) {
    const batches = [];
    let batch = [];
    let characters = 0;
    for (const record of records) {
      const firstBatch = prioritizeFirst && !batches.length;
      if (
        batch.length &&
        (batch.length >=
          (firstBatch ? FIRST_BATCH_MAX_ITEMS : BATCH_MAX_ITEMS) ||
          characters + (record.requestText || record.text).length >
          (firstBatch ? FIRST_BATCH_MAX_CHARS : BATCH_MAX_CHARS))
      ) {
        batches.push(batch);
        batch = [];
        characters = 0;
      }
      batch.push(record);
      characters += (record.requestText || record.text).length;
    }
    if (batch.length) batches.push(batch);
    return batches;
  }

  function groupRecords(records) {
    const groups = new Map();
    for (const record of records) {
      let group = groups.get(record.key);
      if (!group) {
        group = {
          formatKey: record.formatKey,
          key: record.key,
          requestText: record.requestText,
          segmentCount: record.segmentCount,
          text: record.text,
          entries: [],
        };
        groups.set(record.key, group);
      } else if (!group.segmentCount && record.segmentCount) {
        group.formatKey = record.formatKey;
        group.requestText = record.requestText;
        group.segmentCount = record.segmentCount;
      }
      group.entries.push(record);
    }
    return [...groups.values()];
  }

  function pageTextLooksUseful(text) {
    const value = normalizeText(text);
    return (
      value.length >= 4 &&
      /\p{L}/u.test(value) &&
      !/^(?:https?:\/\/|www\.)\S+$/i.test(value)
    );
  }

  function viewportPriority(rect, viewportHeight) {
    if (rect.bottom >= 0 && rect.top <= viewportHeight) {
      return [0, Math.max(0, rect.top)];
    }
    if (rect.top > viewportHeight) return [1, rect.top - viewportHeight];
    return [2, -rect.bottom];
  }

  function compareViewportPriority(a, b, viewportHeight) {
    const [aZone, aDistance] = viewportPriority(a, viewportHeight);
    const [bZone, bDistance] = viewportPriority(b, viewportHeight);
    return aZone - bZone || aDistance - bDistance;
  }

  function isNearViewport(rect, viewportHeight) {
    return viewportPriority(rect, viewportHeight)[1] <= viewportHeight;
  }

  function parseTranslations(content, expectedLength) {
    const text = String(content || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    if (!text) {
      throw responseFormatError("The AI output was empty.", text);
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw responseFormatError(`JSON error: ${error.message}`, text);
    }
    const translations = Array.isArray(parsed) ? parsed : parsed?.translations;
    if (!Array.isArray(translations)) {
      throw responseFormatError(
        'The response is missing a "translations" array.',
        text,
      );
    }
    if (translations.length !== expectedLength) {
      throw responseFormatError(
        `Expected ${expectedLength} translations, received ${translations.length}.`,
        text,
      );
    }
    const invalidIndex = translations.findIndex(
      (item) => typeof item !== "string" || !item.trim(),
    );
    if (invalidIndex >= 0) {
      throw responseFormatError(
        `Translation ${invalidIndex + 1} is empty or is not text.`,
        text,
      );
    }
    return translations.map((item) => item.trim());
  }

  function inlineSegmentText(children) {
    return children
      .map((child) =>
        typeof child === "string" ? child : inlineSegmentText(child.children),
      )
      .join("");
  }

  function parseInlineTranslation(value, expectedSegments = 0) {
    const raw = String(value || "").trim();
    const tagPattern = /<(\/?)(\d+)>/g;
    if (!expectedSegments) return { translation: raw, segments: null };
    const translation = raw.replace(tagPattern, "").trim();

    const root = [];
    const stack = [{ index: -1, children: root }];
    const opened = new Set();
    const closed = new Set();
    let lastIndex = 0;
    let match;
    while ((match = tagPattern.exec(raw))) {
      if (match.index > lastIndex) {
        stack[stack.length - 1].children.push(
          raw.slice(lastIndex, match.index),
        );
      }
      lastIndex = tagPattern.lastIndex;
      const isClosing = Boolean(match[1]);
      const index = Number(match[2]);
      if (!isClosing) {
        if (index >= expectedSegments || opened.has(index)) {
          return { translation, segments: null };
        }
        opened.add(index);
        const segment = { index, children: [] };
        stack[stack.length - 1].children.push(segment);
        stack.push(segment);
      } else {
        if (stack.length <= 1 || stack[stack.length - 1].index !== index) {
          return { translation, segments: null };
        }
        const segment = stack.pop();
        if (!inlineSegmentText(segment.children).trim()) {
          return { translation, segments: null };
        }
        closed.add(index);
      }
    }
    if (lastIndex < raw.length) {
      stack[stack.length - 1].children.push(raw.slice(lastIndex));
    }
    if (stack.length !== 1 || closed.size !== expectedSegments) {
      return { translation, segments: null };
    }
    return { translation, segments: root };
  }

  function isSafeHref(value) {
    const raw = String(value || "").trim();
    if (!raw) return false;
    try {
      const url = new URL(raw, "https://example.invalid");
      return /^(?:https?:|mailto:|tel:)$/i.test(url.protocol);
    } catch {
      return false;
    }
  }

  function oversizedBlocksError(lengths) {
    const count = lengths.length;
    const largest = Math.max(...lengths);
    const subject =
      count === 1 ? "This text block is" : `${count} text blocks are`;
    return new Error(
      `${subject} too long to translate safely. Largest: ${largest} characters; limit: ${BATCH_MAX_CHARS}.`,
    );
  }

  function requestTranslations(texts, settings) {
    const systemPrompt = [
      translationRulesFor(settings.targetLanguage),
      "Each input string is a complete text block. Read the whole block before translating; use related blocks only as context for terminology and references.",
      "Preserve paragraph breaks and line breaks within each block. Keep content in its original array slot; never merge, split, or move content between slots.",
      "Preserve exact numbered tags like <0>...</0> around the corresponding translated phrases, keeping them balanced and moving them with natural target-language word order.",
      "If a block is already in the target language, return it unchanged.",
      'Return a JSON object with a "translations" array in the same order and length as the input array.',
    ].join(" ");
    const userPrompt = [
      `Translate the following web page content into ${settings.targetLanguage}:`,
      JSON.stringify(texts),
    ].join("\n\n");
    return sendProviderRequest(settings, {
      schemaName: "translation_batch",
      systemPrompt,
      userContent: userPrompt,
      geminiParts: [{ text: userPrompt }],
      parseResponse: (content) => {
        const translations = parseTranslations(content, texts.length)
          .map((translation) => translation.replace(/\r\n?/g, "\n"));
        translations.forEach((translation, index) => {
          const sourceBreaks = String(texts[index]).match(/\n+/g) || [];
          const translatedBreaks = translation.match(/\n+/g) || [];
          if (sourceBreaks.join("|") !== translatedBreaks.join("|")) {
            throw responseFormatError(`Translation ${index + 1} did not preserve paragraph and line breaks.`, content);
          }
        });
        return translations;
      },
      schema: {
        type: "object",
        properties: {
          translations: {
            type: "array", items: { type: "string" },
            minItems: texts.length, maxItems: texts.length,
          },
        },
        required: ["translations"], additionalProperties: false,
      },
    });
  }
