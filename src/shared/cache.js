  function hashString64(input) {
    let hash = 0xcbf29ce484222325n;
    for (const character of String(input || "")) {
      hash ^= BigInt(character.codePointAt(0));
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return `${hash.toString(16).padStart(16, "0")}-${String(input || "").length}`;
  }

  function translationCacheKey(source, settings, promptVersion) {
    return hashString64([
      promptVersion,
      settings.apiFormat || "chat-completions",
      settings.baseURL,
      settings.model,
      settings.targetLanguage,
      thinkingLevelFor(settings),
      source,
    ].join("\u0000"));
  }

  function loadCache() {
    const cache = GM_getValue(CACHE_KEY, {});
    return cache && typeof cache === "object" && !Array.isArray(cache)
      ? cache
      : {};
  }

  function saveCache(entries) {
    const cache = Object.assign(loadCache(), entries);
    const keys = Object.keys(cache);
    if (keys.length > CACHE_LIMIT) {
      keys
        .sort((a, b) => (cache[a]?.at || 0) - (cache[b]?.at || 0))
        .slice(0, keys.length - CACHE_LIMIT)
        .forEach((key) => delete cache[key]);
    }
    GM_setValue(CACHE_KEY, cache);
    return cache;
  }
