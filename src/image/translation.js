  function hashImageCacheKey(imageHash, settings) {
    return translationCacheKey(imageHash, settings, "image-prompt-v10");
  }

  function normalizeImageRegion(value) {
    const box = Array.isArray(value) ? value : value?.box_2d;
    if (!Array.isArray(box) || box.length !== 4) return null;
    const coords = box.map((item) => Math.round(Number(item)));
    if (coords.some((item) => !Number.isFinite(item))) return null;
    const [ymin, xmin, ymax, xmax] = coords;
    if (ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000) return null;
    if (ymin >= ymax || xmin >= xmax) return null;
    const translation =
      typeof value?.translation === "string" ? value.translation.trim() : "";
    return {
      box_2d: [ymin, xmin, ymax, xmax],
      ...(translation ? { translation } : {}),
    };
  }

  function parseRegionTranslation(translation, regionCount) {
    const raw = String(translation || "")
      .replace(/\r\n?/gu, "\n")
      .trim();
    if (!raw) {
      return {
        displayText: "",
        markersMatch: false,
        sections: [],
      };
    }
    const markerRegex = /\[\[BABEL_REGION_(\d+)\]\]/gu;
    const matches = Array.from(raw.matchAll(markerRegex));
    if (
      regionCount > 0 &&
      matches.length === regionCount &&
      raw.slice(0, matches[0].index).trim() === ""
    ) {
      const sections = [];
      let markersMatch = true;
      for (let i = 0; i < matches.length; i += 1) {
        const expectedNumber = i + 1;
        const actualNumber = Number(matches[i][1]);
        const sectionStart = matches[i].index + matches[i][0].length;
        const sectionEnd =
          i + 1 < matches.length ? matches[i + 1].index : raw.length;
        const sectionText = raw
          .slice(sectionStart, sectionEnd)
          .replace(/^\s+/u, "")
          .replace(/\s+$/u, "");
        if (actualNumber !== expectedNumber || !sectionText) {
          markersMatch = false;
          break;
        }
        sections.push(sectionText);
      }
      if (markersMatch) {
        return {
          displayText: sections
            .map((section, index) => `[${index + 1}] ${section}`)
            .join("\n\n"),
          markersMatch: true,
          sections,
        };
      }
    }
    const displayText = raw
      .replace(markerRegex, "")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/^[ \t]+/gmu, "")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
    return {
      displayText,
      markersMatch: false,
      sections: [],
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

  function parseImageTranslation(content) {
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
    const rawTranslation =
      typeof parsed.translation === "string" ? parsed.translation.trim() : "";
    const rawRegions = parsed.regions;
    const normalizedRegions = Array.isArray(rawRegions)
      ? rawRegions.map(normalizeImageRegion)
      : [];
    const regionsValid =
      Array.isArray(rawRegions) &&
      rawRegions.length > 0 &&
      rawRegions.length <= IMAGE_MAX_REGIONS &&
      normalizedRegions.every(Boolean);
    const validRegions = regionsValid ? normalizedRegions : [];
    const hasRegionObjectText =
      Array.isArray(rawRegions) &&
      rawRegions.length > 0 &&
      rawRegions.length <= IMAGE_MAX_REGIONS &&
      rawRegions.every(
        (region) =>
          typeof region?.translation === "string" && region.translation.trim(),
      );
    if (!rawTranslation && !hasRegionObjectText) {
      throw responseFormatError(
        'The response is missing a non-empty "translation" string.',
        text,
        EXPECTED_FORMAT,
      );
    }
    const normalized = parseRegionTranslation(
      rawTranslation,
      validRegions.length,
    );
    if (regionsValid && (normalized.markersMatch || hasRegionObjectText)) {
      const pairedRegions = validRegions
        .map((region, index) => ({
          box_2d: region.box_2d,
          translation: normalized.markersMatch ? normalized.sections[index] : region.translation,
        }))
        .filter(isUsefulImageRegion);
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
    const displayText = normalized.displayText || (hasRegionObjectText
      ? rawRegions
          .map((region, index) => `[${index + 1}] ${region.translation.trim()}`)
          .join("\n\n")
      : "");
    if (!displayText) {
      throw responseFormatError(
        'The response "translation" string contained no text.',
        text,
        EXPECTED_FORMAT,
      );
    }
    return {
      hasText: true,
      regions: [],
      translation: displayText,
    };
  }

  function requestImageTranslation(imageData, settings) {
    const base64 = String(imageData?.base64 || "").trim();
    const mimeType = String(imageData?.mimeType || "image/jpeg").trim();
    if (!base64) {
      throw new Error("Image data is required for image translation.");
    }
    const systemPrompt = [
      translationRulesFor(settings.targetLanguage),
      "Read the whole image first to understand the scene, speakers, references, and terminology before translating each region.",
      "Focus strictly on core content that a reader wants to understand: article or post body text, comic/manga dialogue and narration, captions, memes, and main presentation or chart explanations.",
      "Ignore and omit peripheral UI and non-content noise: OS or phone status bars (clock, battery, signal, carrier), browser or app navigation bars, tabs, menus, interactive buttons (e.g. Back, Follow, Reply, Repost, Like, Share, Subscribe, Search), on-screen keyboards, social media metadata (@handles, standalone timestamps, view/like/repost counts, standalone URLs), page numbers, watermarks, logos, and blurry background text.",
      `Also omit text that is already in ${settings.targetLanguage}, as well as standalone numbers, symbols, or code identifiers that do not need translation.`,
      'Return one JSON object with "has_text" (boolean) and "regions" (array of region objects in reading order, at most 99 regions).',
      'When no meaningful translatable content remains after filtering UI and noise, return {"has_text":false,"regions":[]}.',
      'When has_text is true, each item in "regions" must be {"box_2d":[ymin,xmin,ymax,xmax],"translation":"..."} where box_2d uses integer coordinates normalized from 0 to 1000.',
      "Predict each region's box_2d tightly around the visible text glyphs only—exclude surrounding empty card or panel whitespace, borders, and non-text artwork.",
      "Group consecutive lines or paragraphs that belong to the same post body, speech bubble, card, list block, or section into a single region (preserving line breaks with \\n) instead of splitting them into small fragments.",
      "Use the image's reading order, including right-to-left manga columns when appropriate. Keep different speakers, panels, and independent columns in separate regions.",
      "Keep negation, emphasis, and speaker tone. Do not invent illegible words; mark an unreadable fragment as [illegible] only when needed inside otherwise readable content.",
      "Do not include markdown, explanations, or keys beyond this contract.",
    ].join(" ");
    const userPrompt = `Inspect the image, ignore UI chrome, status bars, metadata, watermarks, and text already in ${settings.targetLanguage}, translate only the meaningful reading content into ${settings.targetLanguage}, and return the JSON object.`;
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
      parseResponse: parseImageTranslation,
      schema: {
        type: "object",
        properties: {
          has_text: { type: "boolean" },
          regions: {
            type: "array",
            items: {
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
