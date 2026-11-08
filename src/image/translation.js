  function hashImageCacheKey(imageHash, settings, ocrProvider = "none") {
    const version = ocrProvider && ocrProvider !== "none"
      ? `image-ocr-v1-${ocrProvider}`
      : "image-prompt-v10";
    return translationCacheKey(imageHash, settings, version);
  }

  function comparableText(value) {
    return String(value || "").replace(/[\s\p{P}\p{S}]+/gu, "").toLowerCase();
  }

  // OCR mode: boxes and source text come from OCR units; the model only groups ids and translates.
  function parseOcrImageTranslation(content, units) {
    const regions = readImageRegions(content, OCR_EXPECTED_FORMAT);
    if (!regions) return { hasText: false, regions: [], translation: "" };
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const used = new Set();
    const result = [];
    for (const region of regions) {
      const ids = (Array.isArray(region?.ids) ? region.ids : [])
        .map(Number)
        .filter((id) => byId.has(id) && !used.has(id));
      const translation =
        typeof region?.translation === "string" ? region.translation.trim() : "";
      if (!ids.length || !translation) continue;
      const matched = ids.map((id) => byId.get(id));
      const source = matched.map((unit) => unit.text).join("\n");
      // Identical output means the model echoed the source (names, logos, or a failed translation).
      if (comparableText(source) === comparableText(translation)) continue;
      ids.forEach((id) => used.add(id));
      result.push({
        box_2d: [
          Math.min(...matched.map((unit) => unit.box_2d[0])),
          Math.min(...matched.map((unit) => unit.box_2d[1])),
          Math.max(...matched.map((unit) => unit.box_2d[2])),
          Math.max(...matched.map((unit) => unit.box_2d[3])),
        ],
        source,
        translation,
      });
    }
    return {
      hasText: result.length > 0,
      regions: result,
      translation: result
        .map((region, index) => `[${index + 1}] ${region.translation}`)
        .join("\n\n"),
    };
  }

  function normalizeImageRegion(value) {
    const box = value?.box_2d;
    if (!Array.isArray(box) || box.length !== 4) return null;
    const coords = box.map((item) => Math.round(Number(item)));
    if (coords.some((item) => !Number.isFinite(item))) return null;
    const [ymin, xmin, ymax, xmax] = coords;
    if (ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000) return null;
    if (ymin >= ymax || xmin >= xmax) return null;
    const translation =
      typeof value?.translation === "string" ? value.translation.trim() : "";
    if (!translation) return null;
    return {
      box_2d: [ymin, xmin, ymax, xmax],
      translation,
    };
  }

  function isUsefulImageText(value) {
    const text = normalizeText(value);
    if (!text || !/\p{L}/u.test(text)) return false;
    if (/^(?:https?:\/\/|www\.|@[A-Za-z0-9_.-]+$)/i.test(text)) return false;
    if (
      /^[+-]?\d+(?:[.,:]\d+)*\s*(?:[KMBkmb]|%|fps|p|px|dB|ms|s|m|h|d|w|mo|yr|AM|PM|4G|5G|LTE)$/i.test(
        text,
      )
    ) {
      return false;
    }
    return true;
  }

  function isUsefulImageRegion(region) {
    if (!region || !Array.isArray(region.box_2d)) return false;
    const [ymin, xmin, ymax, xmax] = region.box_2d;
    if (ymax - ymin < 8 || xmax - xmin < 8) return false;
    return isUsefulImageText(region.translation);
  }

  function mergeDenseImageRegions(regions) {
    if (!Array.isArray(regions) || regions.length <= 1) return regions || [];
    const items = regions.map((region) => ({
      box_2d: [...region.box_2d],
      translation: String(region.translation || "").trim(),
    }));
    const merged = [];
    const consumed = new Array(items.length).fill(false);

    for (let i = 0; i < items.length; i += 1) {
      if (consumed[i]) continue;
      const current = {
        box_2d: [...items[i].box_2d],
        translation: items[i].translation,
      };
      consumed[i] = true;

      let changed = true;
      while (changed) {
        changed = false;
        for (let j = i + 1; j < items.length; j += 1) {
          if (consumed[j]) continue;
          const candidate = items[j];
          const [curYmin, curXmin, curYmax, curXmax] = current.box_2d;
          const [nextYmin, nextXmin, nextYmax, nextXmax] = candidate.box_2d;
          const curWidth = Math.max(1, curXmax - curXmin);
          const curHeight = Math.max(1, curYmax - curYmin);
          const nextWidth = Math.max(1, nextXmax - nextXmin);
          const nextHeight = Math.max(1, nextYmax - nextYmin);

          const vGap = nextYmin - curYmax;
          const maxAllowedGap = Math.min(
            18,
            Math.min(curHeight, nextHeight) * 0.45,
          );
          if (vGap < -8 || vGap > maxAllowedGap) continue;
          if (nextHeight > 70 || curHeight > 220) continue;

          const overlapX =
            Math.min(curXmax, nextXmax) - Math.max(curXmin, nextXmin);
          const maxWidth = Math.max(curWidth, nextWidth);
          const leftDiff = Math.abs(curXmin - nextXmin);
          const sameColumn = leftDiff <= 20 && overlapX / maxWidth >= 0.75;
          if (!sameColumn) continue;

          const newYmin = Math.min(curYmin, nextYmin);
          const newYmax = Math.max(curYmax, nextYmax);
          if (newYmax - newYmin > 260) continue;

          current.box_2d = [
            newYmin,
            Math.min(curXmin, nextXmin),
            newYmax,
            Math.max(curXmax, nextXmax),
          ];
          current.translation = [current.translation, candidate.translation]
            .filter(Boolean)
            .join("\n");
          consumed[j] = true;
          changed = true;
        }
      }
      merged.push(current);
    }
    return merged;
  }

  // Returns the raw regions array, or null when the model reports no text.
  function readImageRegions(content, expected) {
    const text = String(content || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    if (!text) {
      throw responseFormatError("The AI output was empty.", text, expected);
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw responseFormatError(`JSON error: ${error.message}`, text, expected);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw responseFormatError("The response is not a JSON object.", text, expected);
    }
    if (typeof parsed.has_text !== "boolean") {
      throw responseFormatError(
        'The response is missing a boolean "has_text" field.',
        text,
        expected,
      );
    }
    if (!parsed.has_text) return null;
    const rawRegions = parsed.regions;
    if (
      !Array.isArray(rawRegions) ||
      !rawRegions.length ||
      rawRegions.length > IMAGE_MAX_REGIONS
    ) {
      throw responseFormatError(
        'The response is missing a valid "regions" array.',
        text,
        expected,
      );
    }
    return rawRegions;
  }

  function parseImageTranslation(content) {
    const rawRegions = readImageRegions(content, EXPECTED_FORMAT);
    if (!rawRegions) {
      return { hasText: false, regions: [], translation: "" };
    }
    const normalizedRegions = rawRegions.map(normalizeImageRegion);
    if (normalizedRegions.some((region) => !region)) {
      throw responseFormatError(
        "One or more image regions are invalid.",
        JSON.stringify(rawRegions),
        EXPECTED_FORMAT,
      );
    }
    const pairedRegions = normalizedRegions.filter(isUsefulImageRegion);
    if (!pairedRegions.length) {
      return { hasText: false, regions: [], translation: "" };
    }
    const mergedRegions = mergeDenseImageRegions(pairedRegions);
    return {
      hasText: true,
      regions: mergedRegions,
      translation: mergedRegions
        .map((region, index) => `[${index + 1}] ${region.translation}`)
        .join("\n\n"),
    };
  }

  function requestImageTranslation(imageData, settings, ocrUnits = null) {
    const base64 = String(imageData?.base64 || "").trim();
    const mimeType = String(imageData?.mimeType || "image/jpeg").trim();
    if (!base64) {
      throw new Error("Image data is required for image translation.");
    }
    const ocr = Array.isArray(ocrUnits) && ocrUnits.length > 0;
    const contract = ocr
      ? [
          'OCR has already extracted the image text into numbered units, given in the user message as JSON. Use the image only as visual context for speakers, layout, and meaning; never predict coordinates.',
          'Return one JSON object with "has_text" (boolean) and "regions" (array in reading order, at most 99 regions).',
          'Each region must be {"ids":[...],"translation":"..."}: "ids" lists the OCR unit ids that form one speech bubble, paragraph, caption, or heading, and "translation" is the full translation of those units joined together.',
          "Group units that belong to the same bubble or paragraph into one region. Keep different speakers, panels, and independent columns in separate regions. Use each id at most once.",
          `Omit ids that are UI noise or already in ${settings.targetLanguage}. "translation" must always be written in ${settings.targetLanguage}; never copy the OCR text unchanged. Fix obvious OCR misreads using the image.`,
          'When no meaningful translatable units remain, return {"has_text":false,"regions":[]}.',
        ]
      : [
          'Return one JSON object with "has_text" (boolean) and "regions" (array of region objects in reading order, at most 99 regions).',
          'When no meaningful translatable content remains after filtering UI and noise, return {"has_text":false,"regions":[]}.',
          'When has_text is true, each item in "regions" must be {"box_2d":[ymin,xmin,ymax,xmax],"translation":"..."} where box_2d uses integer coordinates normalized from 0 to 1000.',
          "Predict each region's box_2d tightly around the visible text glyphs only—exclude surrounding empty card or panel whitespace, borders, and non-text artwork.",
          "Group consecutive lines or paragraphs that belong to the same post body, speech bubble, card, list block, or section into a single region (preserving line breaks with \\n) instead of splitting them into small fragments.",
          "Use the image's reading order, including right-to-left manga columns when appropriate. Keep different speakers, panels, and independent columns in separate regions.",
        ];
    const systemPrompt = [
      translationRulesFor(settings.targetLanguage),
      "Read the whole image first to understand the scene, speakers, references, and terminology before translating each region.",
      "Focus strictly on core content that a reader wants to understand: article or post body text, comic/manga dialogue and narration, captions, memes, and main presentation or chart explanations.",
      "Ignore and omit peripheral UI and non-content noise: OS or phone status bars (clock, battery, signal, carrier), browser or app navigation bars, tabs, menus, interactive buttons (e.g. Back, Follow, Reply, Repost, Like, Share, Subscribe, Search), on-screen keyboards, social media metadata (@handles, standalone timestamps, view/like/repost counts, standalone URLs), page numbers, watermarks, logos, and blurry background text.",
      `Also omit text that is already in ${settings.targetLanguage}, as well as standalone numbers, symbols, or code identifiers that do not need translation.`,
      ...contract,
      "Keep negation, emphasis, and speaker tone. Do not invent illegible words; mark an unreadable fragment as [illegible] only when needed inside otherwise readable content.",
      "Do not include markdown, explanations, or keys beyond this contract.",
    ].join(" ");
    const userPrompt = ocr
      ? `OCR units:\n${JSON.stringify(ocrUnits.map(({ id, text }) => ({ id, text })))}\n\nGroup and translate the meaningful units into ${settings.targetLanguage}, and return the JSON object.`
      : `Inspect the image, ignore UI chrome, status bars, metadata, watermarks, and text already in ${settings.targetLanguage}, translate only the meaningful reading content into ${settings.targetLanguage}, and return the JSON object.`;
    const regionSchema = ocr
      ? {
          type: "object",
          properties: {
            ids: { type: "array", items: { type: "integer" } },
            translation: { type: "string" },
          },
          required: ["ids", "translation"],
          additionalProperties: false,
        }
      : {
          type: "object",
          properties: {
            box_2d: {
              type: "array",
              items: { type: "integer" },
            },
            translation: { type: "string" },
          },
          required: ["box_2d", "translation"],
          additionalProperties: false,
        };
    return sendProviderRequest(settings, {
      expectedFormat: ocr ? OCR_EXPECTED_FORMAT : EXPECTED_FORMAT,
      allowGenericSchemaFallback: true,
      retryInvalidOutput: true,
      geminiParts: [
        { text: userPrompt },
        {
          inlineData: {
            data: base64,
            mimeType,
          },
        },
      ],
      imageMimeType: mimeType,
      parseResponse: ocr
        ? (content) => parseOcrImageTranslation(content, ocrUnits)
        : parseImageTranslation,
      schema: {
        type: "object",
        properties: {
          has_text: { type: "boolean" },
          regions: {
            type: "array",
            items: regionSchema,
          },
        },
        required: ["has_text", "regions"],
        additionalProperties: false,
      },
      schemaName: ocr ? "babel_lens_ocr_translation" : "babel_lens_translation",
      systemPrompt,
      userContent: [
        { type: "text", text: userPrompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
          },
        },
      ],
    });
  }
