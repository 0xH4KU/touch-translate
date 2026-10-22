  function normalizeLineBreaks(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isRenderedTextNode(node, root) {
    for (
      let element = node?.tagName ? node : node?.parentElement;
      element;
      element = element.parentElement
    ) {
      // Mobile YouTube repeats the visible comment in its button's aria-label.
      if (
        element.matches?.(NON_TEXT_SELECTOR) &&
        !(
          element === root &&
          (element.matches?.(YOUTUBE_COMMENT_SELECTOR) ||
            element.classList?.contains?.(TRANSLATION_CLASS))
        )
      ) return false;
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        style.contentVisibility === "hidden"
      ) {
        return false;
      }
      if (element === root) return true;
    }
    return false;
  }

  // Page content and rendering

  function preservesNewlines(node, root) {
    let sawWhiteSpace = false;
    for (
      let element = node?.parentElement || root;
      element;
      element = element === root ? null : element.parentElement || root
    ) {
      const whiteSpace =
        typeof getComputedStyle === "function"
          ? getComputedStyle(element)?.whiteSpace
          : "";
      if (whiteSpace) {
        sawWhiteSpace = true;
        if (/^(?:pre|pre-wrap|pre-line|break-spaces)$/i.test(whiteSpace)) {
          return true;
        }
      }
    }
    return !sawWhiteSpace && /\r?\n/.test(root?.innerText || "");
  }

  function isBlockBox(element) {
    if (!element || typeof getComputedStyle !== "function") return false;
    const style = getComputedStyle(element);
    const display = style?.display || "";
    if (display === "contents") return false;
    if (display && !display.startsWith("inline")) return true;
    return /^(?:ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|FOOTER|FORM|H[1-6]|HEADER|HR|LI|MAIN|NAV|OL|P|PRE|SECTION|TABLE|TR|UL)$/i.test(
      element.tagName || "",
    );
  }

  function nearestBlockAncestor(node, root) {
    for (
      let element = node?.parentElement;
      element && element !== root;
      element = element.parentElement
    ) {
      if (isBlockBox(element)) return element;
    }
    return root;
  }

  function inlineAncestors(node, root) {
    const stop = nearestBlockAncestor(node, root);
    const chain = [];
    for (
      let element = node?.parentElement;
      element && element !== stop && element !== root;
      element = element.parentElement
    ) {
      if (!isBlockBox(element)) chain.unshift(element);
    }
    return { chain, stop };
  }

  function extractInlineStructure(element) {
    const nodes = contentNodes(element);
    if (!nodes.length) {
      return {
        container: element,
        plainText: "",
        requestText: "",
        wrappers: [],
      };
    }
    const entries = [];
    const textEntries = [];
    for (const node of nodes) {
      if (node?.tagName === "BR") {
        entries.push({ node, isBreak: true, ...inlineAncestors(node, element) });
        continue;
      }
      const keepNewlines = preservesNewlines(node, element);
      const value = keepNewlines
        ? normalizeLineBreaks(node.nodeValue)
        : normalizeText(node.nodeValue);
      if (value) {
        const entry = { node, isBreak: false, ...inlineAncestors(node, element) };
        entries.push(entry);
        textEntries.push(entry);
      }
    }
    if (!textEntries.length) {
      return {
        container: element,
        plainText: "",
        requestText: "",
        wrappers: [],
      };
    }

    let commonPrefix = 0;
    if (entries.every((entry) => entry.stop === element)) {
      const firstChain = entries[0].chain;
      while (
        commonPrefix < firstChain.length &&
        entries.every(
          (entry) => entry.chain[commonPrefix] === firstChain[commonPrefix],
        )
      ) {
        commonPrefix += 1;
      }
    }
    const container =
      commonPrefix > 0 ? entries[0].chain[commonPrefix - 1] : element;

    const counts = new Map();
    for (const entry of textEntries) {
      entry.trimmedChain = entry.chain.slice(commonPrefix);
      for (const ancestor of entry.trimmedChain) {
        counts.set(ancestor, (counts.get(ancestor) || 0) + 1);
      }
    }

    const unitsByNode = new Map();
    for (const entry of textEntries) {
      const units = [];
      for (const ancestor of entry.trimmedChain) {
        const prev = units[units.length - 1];
        if (prev && counts.get(prev.key) === counts.get(ancestor)) {
          prev.elements.push(ancestor);
        } else {
          units.push({ key: ancestor, elements: [ancestor] });
        }
      }
      unitsByNode.set(entry.node, units);
    }

    const wrappers = [];
    const openUnits = [];
    let plainResult = "";
    let taggedResult = "";
    let previousText = null;
    let previousValue = "";

    const closeOpenUnits = (targetLength = 0) => {
      while (openUnits.length > targetLength) {
        const closed = openUnits.pop();
        taggedResult += `</${closed.id}>`;
      }
    };

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node?.tagName === "BR") {
        if (plainResult && !plainResult.endsWith("\n\n")) {
          closeOpenUnits(0);
          plainResult = `${plainResult.replace(/ +$/, "")}\n`;
          taggedResult = `${taggedResult.replace(/ +$/, "")}\n`;
        }
        continue;
      }
      const rawValue = String(node?.nodeValue || "");
      const keepNewlines = preservesNewlines(node, element);
      const value = keepNewlines
        ? normalizeLineBreaks(rawValue)
        : normalizeText(rawValue);
      if (!value) {
        if (keepNewlines && plainResult) {
          const breaks = (rawValue.match(/\r?\n/g) || []).length;
          if (breaks > 0) {
            closeOpenUnits(0);
            const brk = breaks >= 2 ? "\n\n" : "\n";
            plainResult = `${plainResult.replace(/ +$/, "")}${brk}`;
            taggedResult = `${taggedResult.replace(/ +$/, "")}${brk}`;
          }
        }
        continue;
      }
      let separator = "";
      if (plainResult && !plainResult.endsWith("\n")) {
        const prevBlock = previousText
          ? nearestBlockAncestor(previousText, element)
          : element;
        const currBlock = nearestBlockAncestor(node, element);
        const boundaryText =
          (previousText?.nodeValue?.match(/\s*$/)?.[0] || "") +
          (rawValue.match(/^\s*/)?.[0] || "");
        const boundaryBreaks =
          keepNewlines ||
          (previousText && preservesNewlines(previousText, element))
            ? (boundaryText.match(/\r?\n/g) || []).length
            : 0;
        if (boundaryBreaks >= 2) {
          separator = "\n\n";
        } else if (boundaryBreaks === 1) {
          separator = "\n";
        } else if (previousText && prevBlock !== currBlock) {
          separator =
            prevBlock?.tagName === "P" || currBlock?.tagName === "P"
              ? "\n\n"
              : "\n";
        } else if (
          /\s$/.test(previousText?.nodeValue) ||
          /^\s/.test(rawValue) ||
          (/[0-9A-Za-z]$/.test(previousValue) && /^[0-9A-Za-z]/.test(value))
        ) {
          separator = " ";
        }
      }

      const units = unitsByNode.get(node) || [];
      let common = 0;
      if (!separator.includes("\n")) {
        while (
          common < openUnits.length &&
          common < units.length &&
          openUnits[common].key === units[common].key
        ) {
          common += 1;
        }
      }
      closeOpenUnits(common);
      plainResult += separator;
      taggedResult += separator;
      for (let uIndex = common; uIndex < units.length; uIndex += 1) {
        const unit = units[uIndex];
        const id = wrappers.push(unit.elements) - 1;
        openUnits.push({ ...unit, id });
        taggedResult += `<${id}>`;
      }
      plainResult += value;
      if (value.includes("\n") && openUnits.length) {
        const parts = value.split(/(\n+)/);
        for (let pIndex = 0; pIndex < parts.length; pIndex += 1) {
          const part = parts[pIndex];
          if (pIndex % 2 === 1) {
            closeOpenUnits(0);
            taggedResult += part;
            for (const unit of units) {
              const id = wrappers.push(unit.elements) - 1;
              openUnits.push({ ...unit, id });
              taggedResult += `<${id}>`;
            }
          } else {
            taggedResult += part;
          }
        }
      } else {
        taggedResult += value;
      }
      previousText = node;
      previousValue = value;
    }
    closeOpenUnits(0);

    const plainText = normalizeLineBreaks(plainResult);
    // shortcut: skip inline tagging past 16 segments or literal <N> text, upgrade if rich-text tables need higher limits
    if (
      !wrappers.length ||
      wrappers.length > 16 ||
      /<\/?\d+>/.test(plainText)
    ) {
      return {
        container,
        plainText,
        requestText: plainText,
        wrappers: [],
      };
    }
    return {
      container,
      plainText,
      requestText: normalizeLineBreaks(taggedResult),
      wrappers,
    };
  }

  function contentNodes(element) {
    const nodes = [];
    const whatToShow =
      NodeFilter.SHOW_TEXT |
      (typeof NodeFilter.SHOW_ELEMENT === "number"
        ? NodeFilter.SHOW_ELEMENT
        : 0);
    const walker = document.createTreeWalker(element, whatToShow, {
      acceptNode: (node) => {
        if (node.tagName === "BR") {
          return isRenderedTextNode(node, element)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
        if (node.nodeType === 1 || node.tagName) {
          return NodeFilter.FILTER_SKIP ?? 3;
        }
        if (!isRenderedTextNode(node, element)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (normalizeText(node.nodeValue)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return /\r?\n/.test(node.nodeValue) && preservesNewlines(node, element)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function sourceText(element) {
    const raw = normalizeLineBreaks(element.innerText ?? element.textContent);
    if (!raw) return "";
    if (
      Array.isArray(element.textNodes) ||
      (typeof Node === "function" && element instanceof Node)
    ) {
      return extractInlineStructure(element).plainText;
    }
    return raw;
  }

  function contentTextNodes(element) {
    const nodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          normalizeText(node.nodeValue) && isRenderedTextNode(node, element)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      },
    );
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function translationRequestFor(element, text) {
    const { requestText, wrappers } = extractInlineStructure(element);
    return {
      requestText: requestText || text,
      segmentCount: wrappers.length,
    };
  }

  function recordMatchesElement(record, settings) {
    const text = sourceText(record.element);
    if (text !== record.text) return false;
    const { requestText } = translationRequestFor(record.element, text);
    return hashCacheKey(requestText, settings) === record.formatKey;
  }

  function translationAnchor(source) {
    // Avoid clipping and keep the note outside mobile's labelled button.
    return source.matches?.(YOUTUBE_COMMENT_SELECTOR)
      ? source.closest("ytd-expander, ytm-comment-renderer") || source
      : source;
  }

  function translationAfter(source) {
    const next = translationAnchor(source).nextElementSibling;
    return next?.classList.contains(TRANSLATION_CLASS) ? next : null;
  }

  function indicatorFor(element) {
    const indicator = element && indicators.get(element);
    if (indicator?.isConnected) return indicator;
    if (element) indicators.delete(element);
    return null;
  }

  function showIndicator(
    element,
    state,
    progress = 0,
    action = "",
    ready = false,
  ) {
    if (!element?.isConnected) return null;
    let indicator = indicatorFor(element);
    if (state === "loading" && indicator?.dataset.state !== "loading") {
      removeIndicator(element);
      indicator = null;
    }
    const created = !indicator;
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = INDICATOR_CLASS;
      indicator.setAttribute("aria-hidden", "true");
      indicators.set(element, indicator);
    }
    if (indicator.parentElement !== element) element.append(indicator);
    if (created) indicator.style.color = getComputedStyle(element).color;
    indicator.dataset.state = state;
    if (state === "gesture") {
      indicator.dataset.action = action;
      indicator.dataset.ready = String(ready);
      indicator.style.setProperty(
        "--touch-translate-progress",
        `${Math.max(0, Math.min(1, progress)) * 360}deg`,
      );
    } else {
      delete indicator.dataset.action;
      delete indicator.dataset.ready;
      indicator.style.removeProperty("--touch-translate-progress");
    }
    return indicator;
  }

  function removeIndicator(element, state) {
    const indicator = indicatorFor(element);
    if (indicator && (!state || indicator.dataset.state === state)) {
      indicators.delete(element);
      indicator.remove();
    }
  }

  function appendTextWithBreaks(parts, text) {
    const lines = String(text || "").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (index > 0 && typeof document.createElement === "function") {
        parts.push(document.createElement("br"));
      }
      if (line) parts.push(line);
    });
  }

  function assembleTranslatedContent(container, text) {
    const lines = String(text || "").split(/\r?\n/);
    if (lines.length <= 1 || typeof document.createElement !== "function") {
      container.replaceChildren(text);
      return;
    }
    const parts = [];
    appendTextWithBreaks(parts, text);
    container.replaceChildren(...parts);
  }

  function hasValidInlineSegments(segments, wrapperCount) {
    if (!Array.isArray(segments) || !segments.length || !wrapperCount) {
      return false;
    }
    let sawTag = false;
    const check = (items) =>
      items.every((item) => {
        if (typeof item === "string") return true;
        if (
          !item ||
          typeof item.index !== "number" ||
          item.index < 0 ||
          item.index >= wrapperCount ||
          !Array.isArray(item.children)
        ) {
          return false;
        }
        sawTag = true;
        return check(item.children);
      });
    return check(segments) && sawTag;
  }

  function renderInlineSegments(container, segments, wrappers) {
    const buildNodes = (items) => {
      const parts = [];
      for (const item of items) {
        if (typeof item === "string") {
          appendTextWithBreaks(parts, item);
          continue;
        }
        const chain = wrappers[item.index];
        let outer = null;
        let inner = null;
        for (const sourceElement of chain) {
          const clone = sourceElement.tagName?.includes("-")
            ? document.createElement("span")
            : sourceElement.cloneNode(false);
          if (sourceElement.tagName?.includes("-")) {
            clone.className = sourceElement.className;
            clone.style.cssText = sourceElement.style.cssText;
          }
          if (!outer) outer = clone;
          else inner.append(clone);
          inner = clone;
        }
        inner.append(...buildNodes(item.children));
        parts.push(outer);
      }
      return parts;
    };
    container.replaceChildren(...buildNodes(segments));
  }

  function insertTranslation(source, result, translations) {
    if (!source.isConnected || translationAfter(source)) return;
    const translation =
      typeof result === "string" ? result : result?.translation;
    if (!normalizeText(translation)) return;

    // A custom element clone can rerender itself and erase the translation.
    const translated = source.tagName.includes("-")
      ? document.createElement("div")
      : source.cloneNode(true);
    if (source.tagName.includes("-")) {
      translated.className = source.className;
      translated.style.cssText = source.style.cssText;
      translated.append(
        ...Array.from(source.childNodes, (node) => node.cloneNode(true)),
      );
    }
    translated
      .querySelectorAll(NON_TEXT_SELECTOR)
      .forEach((node) => node.remove());
    const unsafeAttributes = new Set([
      "id",
      "name",
      "role",
      "href",
      "src",
      "srcset",
      "action",
      "formaction",
      "target",
      "rel",
      "download",
      "tabindex",
      "contenteditable",
      "autofocus",
      "for",
    ]);
    for (const element of [translated, ...translated.querySelectorAll("*")]) {
      const keepLink =
        element.tagName === "A" && isSafeHref(element.getAttribute("href"));
      for (const attribute of Array.from(element.attributes || [])) {
        const name = attribute.name.toLowerCase();
        if (
          keepLink &&
          (name === "href" || name === "target" || name === "rel")
        ) {
          continue;
        }
        if (
          unsafeAttributes.has(name) ||
          name.startsWith("aria-") ||
          name.startsWith("on")
        ) {
          element.removeAttribute(attribute.name);
        }
      }
      if (
        keepLink &&
        /^_blank$/i.test(element.getAttribute("target") || "")
      ) {
        const rel = new Set(
          String(element.getAttribute("rel") || "")
            .split(/\s+/)
            .filter(Boolean),
        );
        rel.add("noopener");
        rel.add("noreferrer");
        element.setAttribute("rel", [...rel].join(" "));
      }
    }
    translated.classList.add(TRANSLATION_CLASS);
    translated.setAttribute("dir", "auto");
    translated.setAttribute("role", "note");
    const animateIn = !globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (animateIn) translated.style.setProperty("opacity", "0", "important");

    const anchor = translationAnchor(source);
    if (anchor !== source || source.tagName.includes("-")) {
      const style = getComputedStyle(source);
      translated.style.font = style.font;
      translated.style.color = style.color;
    }
    anchor.insertAdjacentElement("afterend", translated);
    translations?.add(translated);
    const { container, wrappers } = extractInlineStructure(translated);
    const nodes = contentTextNodes(translated);
    const segments = Array.isArray(result?.segments) ? result.segments : null;
    if (hasValidInlineSegments(segments, wrappers.length)) {
      renderInlineSegments(container, segments, wrappers);
    } else if (nodes.length === 1 && !/\r?\n/.test(translation)) {
      nodes[0].nodeValue = translation;
    } else {
      assembleTranslatedContent(container, translation);
    }
    if (animateIn) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (translated.isConnected && !removingTranslations.has(translated)) {
            translated.style.removeProperty("opacity");
          }
        });
      });
    }
  }

  function removeTranslation(element) {
    if (!element?.isConnected || removingTranslations.has(element)) return;
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      element.remove();
      return;
    }
    removingTranslations.add(element);
    element.style.setProperty(
      "transition",
      "opacity 140ms ease-in",
      "important",
    );
    element.style.setProperty("opacity", "0", "important");
    setTimeout(() => element.remove(), 140);
  }

  function isVisible(element) {
    if (!element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function pageContentRoots() {
    const main = [...document.querySelectorAll(CONTENT_ROOT_SELECTOR)].filter(
      isVisible,
    );
    if (main.length) return main;
    const articles = [...document.querySelectorAll("article")].filter(isVisible);
    return articles.length
      ? articles
      : [document.body || document.documentElement];
  }

  function isUsefulPageBlock(element, text) {
    const chrome = element.matches?.(YOUTUBE_COMMENT_SELECTOR)
      ? element.parentElement?.closest(PAGE_CHROME_SELECTOR)
      : element.closest(PAGE_CHROME_SELECTOR);
    if (!pageTextLooksUseful(text) || chrome) {
      return false;
    }
    const outerChrome = element.closest("header, footer");
    if (
      outerChrome &&
      !outerChrome.closest("article, main, [role='main']")
    ) {
      return false;
    }
    if (element.matches?.(TITLE_BLOCK_SELECTOR)) return true;
    const linkedCharacters = element.closest("a")
      ? text.length
      : [...element.querySelectorAll("a")].reduce(
        (sum, link) => sum + sourceText(link).length,
        0,
      );
    // ponytail: link density is intentionally conservative; add site rules only
    // when a regular reading site proves this heuristic wrong.
    return text.length >= 160 || linkedCharacters / text.length <= 0.8;
  }

  function isTranslatablePageBlock(element, roots, text) {
    if (
      !element?.isConnected ||
      isSuiteUi(element) ||
      !roots.some((root) => root.contains(element)) ||
      element.closest(`.${TRANSLATION_CLASS}`) ||
      element.querySelector(BLOCK_SELECTOR) ||
      (!element.matches?.(TITLE_BLOCK_SELECTOR) && hasNestedTextBlock(element)) ||
      translationAfter(element) ||
      !isVisible(element)
    ) {
      return false;
    }
    return isUsefulPageBlock(element, text ?? sourceText(element));
  }

  function collectPageBlocks(nearbyOnly = false) {
    const roots = pageContentRoots();
    const viewportHeight = innerHeight || document.documentElement.clientHeight;
    return [...document.querySelectorAll(BLOCK_SELECTOR)]
      .filter((element) => roots.some((root) => root.contains(element)))
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }))
      .filter(
        ({ rect }) => !nearbyOnly || isNearViewport(rect, viewportHeight),
      )
      .map((record) => ({ ...record, text: sourceText(record.element) }))
      .filter(({ element, text }) =>
        isTranslatablePageBlock(element, roots, text),
      )
      .sort((a, b) =>
        compareViewportPriority(a.rect, b.rect, viewportHeight),
      )
      .map(({ element }) => element);
  }
