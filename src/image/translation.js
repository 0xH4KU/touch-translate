  function hashImageCacheKey(imageHash, settings) {
    return translationCacheKey(imageHash, settings, "image-prompt-v11");
  }

  function resolveCandidateBoxUnion(ids, rawBox, candidateMap) {
    if (!(candidateMap instanceof Map) || !candidateMap.size) return null;
    let matched = ids.map((id) => candidateMap.get(id)).filter(Boolean);
    if (matched.length && rawBox) {
      const rawCy = (rawBox[0] + rawBox[2]) / 2;
      const rawCx = (rawBox[1] + rawBox[3]) / 2;
      const near = matched.filter((box) => {
        const cy = (box[0] + box[2]) / 2;
        const cx = (box[1] + box[3]) / 2;
        return Math.hypot(cx - rawCx, cy - rawCy) <= 450;
      });
      if (near.length) matched = near;
    }
    if (!matched.length && rawBox) {
      for (const candBox of candidateMap.values()) {
        const iy0 = Math.max(rawBox[0], candBox[0]);
        const ix0 = Math.max(rawBox[1], candBox[1]);
        const iy1 = Math.min(rawBox[2], candBox[2]);
        const ix1 = Math.min(rawBox[3], candBox[3]);
        if (iy1 > iy0 && ix1 > ix0) {
          const inter = (iy1 - iy0) * (ix1 - ix0);
          const candArea = Math.max(
            1,
            (candBox[2] - candBox[0]) * (candBox[3] - candBox[1]),
          );
          if (inter / candArea >= 0.6) matched.push(candBox);
        }
      }
    }
    if (!matched.length) return null;
    return [
      Math.min(...matched.map((b) => b[0])),
      Math.min(...matched.map((b) => b[1])),
      Math.max(...matched.map((b) => b[2])),
      Math.max(...matched.map((b) => b[3])),
    ];
  }

  function normalizeImageRegion(value, candidateMap = null, profile = null) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rawIds = Array.isArray(value.ids)
      ? value.ids
      : Number.isInteger(value.id)
        ? [value.id]
        : [];
    const ids = rawIds
      .map((item) => Math.round(Number(item)))
      .filter((item) => Number.isInteger(item) && item > 0);

    let rawBox = null;
    const box = value.box_2d;
    if (Array.isArray(box) && box.length === 4) {
      const coords = box.map((item) => Math.round(Number(item)));
      if (
        coords.every((item) => Number.isFinite(item)) &&
        coords[0] >= 0 &&
        coords[1] >= 0 &&
        coords[2] <= 1000 &&
        coords[3] <= 1000 &&
        coords[0] < coords[2] &&
        coords[1] < coords[3]
      ) {
        rawBox = coords;
      }
    }

    const candidateUnion = resolveCandidateBoxUnion(ids, rawBox, candidateMap);
    let finalBox = candidateUnion || rawBox;
    if (!finalBox) return null;
    if (profile && typeof snapBoxToInk === "function") {
      finalBox = snapBoxToInk(finalBox, profile) || finalBox;
    }

    const translation =
      typeof value.translation === "string" ? value.translation.trim() : "";
    if (!translation) return null;
    const source =
      typeof value.source === "string" ? value.source.trim() : "";
    const normalized = {
      box_2d: finalBox,
      translation,
    };
    if (source) normalized.source = source;
    if (ids.length || candidateUnion) normalized.ids = ids;
    return normalized;
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
    if (region.source && !isUsefulImageText(region.source)) return false;
    return isUsefulImageText(region.translation);
  }

  function normalizeComparableText(value) {
    return String(value || "")
      .replace(/[\s\p{P}\p{S}\d]+/gu, "")
      .toLowerCase();
  }

  function isChineseTargetLanguage(targetLanguage) {
    return /^(?:zh\b|chinese|traditional chinese|simplified chinese|繁體|簡體|中文|正體)/i.test(
      String(targetLanguage || "").trim(),
    );
  }

  function isUntranslatedImageRegion(region, targetLanguage = "") {
    const trans = String(region?.translation || "").trim();
    const source = String(region?.source || "").trim();
    if (!trans) return true;
    if (source) {
      const normSource = normalizeComparableText(source);
      const normTrans = normalizeComparableText(trans);
      if (normSource && normSource === normTrans) {
        return true;
      }
    }
    if (isChineseTargetLanguage(targetLanguage)) {
      const kanaOrHangul = (
        trans.match(/[\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []
      ).length;
      const letters = (trans.match(/\p{L}/gu) || []).length;
      if (kanaOrHangul >= 2 && kanaOrHangul / Math.max(1, letters) >= 0.25) {
        return true;
      }
    }
    return false;
  }

  function mergeDenseImageRegions(regions) {
    if (!Array.isArray(regions) || regions.length <= 1) {
      return (regions || []).map((region) => ({
        box_2d: [...region.box_2d],
        translation: String(region.translation || "").trim(),
      }));
    }
    const items = regions.map((region) => ({
      box_2d: [...region.box_2d],
      locked: Array.isArray(region.ids),
      translation: String(region.translation || "").trim(),
    }));
    const merged = [];
    const consumed = new Array(items.length).fill(false);

    for (let i = 0; i < items.length; i += 1) {
      if (consumed[i]) continue;
      const current = {
        box_2d: [...items[i].box_2d],
        locked: items[i].locked,
        translation: items[i].translation,
      };
      consumed[i] = true;

      let changed = true;
      while (changed && !current.locked) {
        changed = false;
        for (let j = i + 1; j < items.length; j += 1) {
          if (consumed[j] || items[j].locked) continue;
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
      merged.push({
        box_2d: current.box_2d,
        translation: current.translation,
      });
    }
    return merged;
  }

  function parseImageTranslation(content, options = {}) {
    const text = String(content || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    if (!text) {
      throw responseFormatError(
        "The AI output was empty.",
        text,
        EXPECTED_FORMAT,
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw responseFormatError(
        `JSON error: ${error.message}`,
        text,
        EXPECTED_FORMAT,
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw responseFormatError(
        "The response is not a JSON object.",
        text,
        EXPECTED_FORMAT,
      );
    }
    if (typeof parsed.has_text !== "boolean") {
      throw responseFormatError(
        'The response is missing a boolean "has_text" field.',
        text,
        EXPECTED_FORMAT,
      );
    }
    if (!parsed.has_text) {
      return { hasText: false, regions: [], translation: "" };
    }
    const rawRegions = parsed.regions;
    if (
      !Array.isArray(rawRegions) ||
      !rawRegions.length ||
      rawRegions.length > IMAGE_MAX_REGIONS
    ) {
      throw responseFormatError(
        'The response is missing a valid "regions" array.',
        text,
        EXPECTED_FORMAT,
      );
    }
    const candidateList = Array.isArray(options?.candidates)
      ? options.candidates
      : [];
    const candidateMap = candidateList.length
      ? new Map(candidateList.map((item) => [item.id, item.box_2d]))
      : null;
    const profile = options?.profile || null;
    const normalizedRegions = rawRegions.map((item) =>
      normalizeImageRegion(item, candidateMap, profile),
    );
    if (normalizedRegions.some((region) => !region)) {
      throw responseFormatError(
        "One or more image regions are invalid.",
        text,
        EXPECTED_FORMAT,
      );
    }
    const pairedRegions = normalizedRegions.filter(isUsefulImageRegion);
    if (!pairedRegions.length) {
      return { hasText: false, regions: [], translation: "" };
    }
    const targetLanguage = String(options?.targetLanguage || "").trim();
    const translatedRegions = pairedRegions.filter(
      (region) => !isUntranslatedImageRegion(region, targetLanguage),
    );
    if (!translatedRegions.length) {
      throw responseFormatError(
        "The AI returned untranslated source text instead of a translation.",
        text,
        EXPECTED_FORMAT,
      );
    }
    const mergedRegions = mergeDenseImageRegions(translatedRegions);
    return {
      hasText: true,
      regions: mergedRegions,
      translation: mergedRegions
        .map((region, index) => `[${index + 1}] ${region.translation}`)
        .join("\n\n"),
    };
  }

  function requestImageTranslation(imageData, settings) {
    const base64 = String(imageData?.base64 || "").trim();
    const mimeType = String(imageData?.mimeType || "image/jpeg").trim();
    if (!base64) {
      throw new Error("Image data is required for image translation.");
    }
    const candidates = Array.isArray(imageData?.candidates)
      ? imageData.candidates
      : [];
    const candidateHint = candidates.length
      ? `Pre-detected numbered text boxes on the image (id:[ymin,xmin,ymax,xmax]): ${candidates
          .map((item) => `#${item.id}:[${item.box_2d.join(",")}]`)
          .join(" ")}. `
      : "";
    const systemPrompt = [
      translationRulesFor(settings.targetLanguage),
      "Read the whole image first to understand the scene, speakers, references, and terminology before translating each region.",
      "Focus strictly on core content that a reader wants to understand: article or post body text, comic/manga dialogue and narration, captions, memes, and main presentation or chart explanations.",
      "Ignore and omit peripheral UI and non-content noise: OS or phone status bars (clock, battery, signal, carrier), browser or app navigation bars, tabs, menus, interactive buttons (e.g. Back, Follow, Reply, Repost, Like, Share, Subscribe, Search), on-screen keyboards, social media metadata (@handles, standalone timestamps, view/like/repost counts, standalone URLs), page numbers, watermarks, logos, and blurry background text.",
      `Also omit text that is already in ${settings.targetLanguage}, as well as standalone numbers, symbols, or code identifiers that do not need translation.`,
      'Return one JSON object with "has_text" (boolean) and "regions" (array of region objects in reading order, at most 99 regions).',
      'When no meaningful translatable content remains after filtering UI and noise, return {"has_text":false,"regions":[]}.',
      'When has_text is true, each item in "regions" must be {"ids":[...],"source":"...","box_2d":[ymin,xmin,ymax,xmax],"translation":"..."} where box_2d uses integer coordinates normalized from 0 to 1000.',
      'When numbered red candidate boxes (#1, #2, ...) are marked on the image, match each meaningful text region to its corresponding candidate box ID(s) in "ids" and set "box_2d" to the tight bounding box of those IDs; if a text block has no matching candidate box, set "ids":[] and predict its tight "box_2d" around the visible text glyphs only.',
      `First transcribe the visible original text into "source", then write its fluent ${settings.targetLanguage} translation into "translation". Never copy or repeat the untranslated "source" text into "translation"—every returned region must be translated into ${settings.targetLanguage}, including titles, headings, short dialogue, and captions.`,
      "Keep each visually distinct speech bubble, paragraph block, heading, or list item in its own tight region instead of merging distant blocks across the page.",
      "Use the image's reading order, including right-to-left manga columns when appropriate. Keep different speakers, panels, and independent columns in separate regions.",
      "Keep negation, emphasis, and speaker tone. Do not invent illegible words; mark an unreadable fragment as [illegible] only when needed inside otherwise readable content.",
      "Do not include markdown, explanations, or keys beyond this contract.",
    ].join(" ");
    const userPrompt = `${candidateHint}Inspect the image, ignore UI chrome, status bars, metadata, watermarks, and text already in ${settings.targetLanguage}, transcribe each meaningful text region into "source" and translate it into ${settings.targetLanguage} in "translation", and return the JSON object.`;
    return sendProviderRequest(settings, {
      expectedFormat: EXPECTED_FORMAT,
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
      parseResponse: (content) =>
        parseImageTranslation(content, {
          candidates,
          profile: imageData?.profile || null,
          targetLanguage: settings.targetLanguage,
        }),
      schema: {
        type: "object",
        properties: {
          has_text: { type: "boolean" },
          regions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ids: {
                  type: "array",
                  items: { type: "integer" },
                },
                source: { type: "string" },
                box_2d: {
                  type: "array",
                  items: { type: "integer" },
                },
                translation: { type: "string" },
              },
              required: ["ids", "source", "box_2d", "translation"],
              additionalProperties: false,
            },
          },
        },
        required: ["has_text", "regions"],
        additionalProperties: false,
      },
      schemaName: "babel_lens_translation",
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
