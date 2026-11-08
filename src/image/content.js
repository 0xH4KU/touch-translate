  function imageContentBox(
    naturalWidth,
    naturalHeight,
    clientWidth,
    clientHeight,
    objectFit = "fill",
    objectPosition = "50% 50%",
  ) {
    const cw = Math.max(0, Number(clientWidth) || 0);
    const ch = Math.max(0, Number(clientHeight) || 0);
    const nw = Math.max(0, Number(naturalWidth) || 0);
    const nh = Math.max(0, Number(naturalHeight) || 0);
    if (!cw || !ch || !nw || !nh) {
      return { height: ch, left: 0, top: 0, width: cw };
    }
    const fit = String(objectFit || "fill").trim().toLowerCase();
    let width = cw;
    let height = ch;
    if (["contain", "cover", "scale-down", "none"].includes(fit)) {
      let scale =
        fit === "cover"
          ? Math.max(cw / nw, ch / nh)
          : Math.min(cw / nw, ch / nh);
      if (fit === "none") scale = 1;
      if (fit === "scale-down") scale = Math.min(1, scale);
      width = nw * scale;
      height = nh * scale;
    }
    const positions =
      String(objectPosition || "50% 50%").match(/calc\([^)]*\)|[^\s]+/g) || [];
    if (/^(top|bottom)$/.test(positions[0])) {
      if (positions.length === 1) positions.unshift("50%");
      else positions.reverse();
    }
    const offset = (value, space) => {
      const position =
        {
          left: "0%",
          top: "0%",
          center: "50%",
          right: "100%",
          bottom: "100%",
        }[value] ||
        value ||
        "50%";
      const terms =
        position.replace(/\s+/g, "").match(/[+-]?(?:\d*\.)?\d+(?:%|px)/g) ||
        [];
      return terms.reduce(
        (sum, term) =>
          sum + parseFloat(term) * (term.endsWith("%") ? space / 100 : 1),
        0,
      );
    };
    return {
      height,
      left: offset(positions[0], cw - width),
      top: offset(positions[1], ch - height),
      width,
    };
  }

  function computeRegionBoxLayout(width, height, regions) {
    if (
      !Array.isArray(regions) ||
      !regions.length ||
      !(width > 4) ||
      !(height > 4)
    ) {
      return [];
    }
    const strokeWidth = clampNumber(
      Math.round(Math.min(width, height) / 360),
      2,
      4,
    );
    const labelHeight = 28;
    const roundCoord = (value) => Math.round(value * 100) / 100;
    return regions.map((region, index) => {
      const label = String(index + 1);
      const [ymin, xmin, ymax, xmax] = region.box_2d;
      const x = clampNumber(roundCoord((xmin / 1000) * width), 0, width - 1);
      const y = clampNumber(roundCoord((ymin / 1000) * height), 0, height - 1);
      const boxWidth = clampNumber(
        roundCoord(((xmax - xmin) / 1000) * width),
        1,
        width - x,
      );
      const boxHeight = clampNumber(
        roundCoord(((ymax - ymin) / 1000) * height),
        1,
        height - y,
      );
      const labelWidth = Math.max(
        labelHeight,
        Math.round(labelHeight * (0.72 + label.length * 0.42)),
      );
      const hasLeftSpace = x >= labelWidth + 3;
      const labelX = clampNumber(
        roundCoord(hasLeftSpace ? x - labelWidth : x),
        1,
        Math.max(1, width - labelWidth - 1),
      );
      const labelY = roundCoord(
        hasLeftSpace
          ? y
          : y >= labelHeight + 3
            ? y - labelHeight
            : y,
      );
      const fontSize = Math.round(
        labelHeight * (label.length > 1 ? 0.46 : 0.56),
      );
      return {
        boxHeight,
        boxWidth,
        fontSize,
        index: index + 1,
        label,
        labelHeight,
        labelWidth,
        labelX,
        labelY,
        strokeWidth,
        x,
        y,
      };
    });
  }

  function clampNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // DOM helpers

  function imageAnchor(img) {
    if (!img) return null;
    const picture = img.closest?.("picture") || img;
    const link = picture.closest?.("a");
    if (link && !normalizeText(link.innerText ?? link.textContent)) return link;
    return picture;
  }

  function isTranslatableImage(img) {
    if (
      !img?.isConnected ||
      isSuiteUi(img) ||
      img.tagName !== "IMG" ||
      img.closest?.(
        `.${IMAGE_VIEWER_CLASS}, .${ERROR_DIALOG_CLASS}, .${SETTINGS_DIALOG_CLASS}, nav, menu, [role='navigation'], [role='menu'], [aria-hidden='true'], [hidden]`,
      ) ||
      !isVisible(img)
    ) {
      return false;
    }
    const src = String(img.currentSrc || img.src || "").trim();
    if (
      !src ||
      /^data:image\/svg\+xml/i.test(src) ||
      !/^(?:https?:|blob:|data:image\/)/i.test(src)
    ) {
      return false;
    }
    const rect = img.getBoundingClientRect?.();
    if (
      !rect ||
      rect.width < IMAGE_MIN_WIDTH ||
      rect.height < IMAGE_MIN_HEIGHT
    ) {
      return false;
    }
    if (
      img.complete &&
      img.naturalWidth > 0 &&
      img.naturalHeight > 0 &&
      (img.naturalWidth < 80 || img.naturalHeight < 60)
    ) {
      return false;
    }
    return true;
  }


  function resolveTargetImage(target, touch) {
    if (isSuiteUi(target)) return null;
    if (
      target?.closest?.(
        `.${IMAGE_VIEWER_CLASS}, .${ERROR_DIALOG_CLASS}, .${SETTINGS_DIALOG_CLASS}`,
      )
    ) {
      return null;
    }
    const isEligibleImage = (node) =>
      Boolean(
        node?.tagName === "IMG" &&
          (isTranslatableImage(node) ||
            imageStates.get(node)?.job ||
            imageStates.get(node)?.result),
      );
    if (isEligibleImage(target)) return target;
    if (!Number.isFinite(touch?.clientX) || !Number.isFinite(touch?.clientY)) {
      return null;
    }
    const elements = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(touch.clientX, touch.clientY)
      : [target];
    // Document hit testing may expose only the host of a shadow tree.
    if (target && !elements.includes(target)) elements.unshift(target);
    const containsPoint = (rect) =>
      touch.clientX >= rect.left &&
      touch.clientX <= (rect.right ?? rect.left + rect.width) &&
      touch.clientY >= rect.top &&
      touch.clientY <= (rect.bottom ?? rect.top + rect.height);
    const unobstructed = (img) => {
      const ancestors = new Set();
      for (let node = img; node; node = node.assignedSlot || node.parentElement || node.getRootNode?.().host) {
        ancestors.add(node);
      }
      for (const element of elements) {
        if (element === img) return true;
        if (ancestors.has(element) || element.closest?.(`.${IMAGE_OVERLAY_CLASS}`)) continue;
        const style = getComputedStyle(element);
        if (Number(style?.opacity) === 0) continue;
        if (/^(?:img|svg|canvas|video|iframe|object|embed)$/i.test(element.tagName || "")) return false;
        const background = style?.backgroundImage || "none";
        const src = String(img.currentSrc || img.src || "");
        if (src && background.includes(src)) continue;
        const color = style?.backgroundColor || "transparent";
        const transparent = color === "transparent" ||
          /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color) ||
          /\/\s*0(?:\.0+)?%?\s*\)$/.test(color);
        if (!transparent || background !== "none") return false;
        if (normalizeText(element.innerText ?? element.textContent)) {
          if (typeof document.createRange !== "function") return false;
          const range = document.createRange();
          for (const child of element.childNodes) {
            if (child.nodeType !== 3 || !normalizeText(child.nodeValue)) continue;
            range.selectNodeContents(child);
            if ([...range.getClientRects()].some(containsPoint)) return false;
          }
        }
      }
      return true;
    };
    for (
      let scope = target;
      scope && scope !== document.body && scope !== document.documentElement;
      scope = scope.parentElement || scope.getRootNode?.().host
    ) {
      if (scope.matches?.("main, [role='main'], [role='feed'], [role='application']")) break;
      for (const candidate of scope.querySelectorAll?.("img") || []) {
        if (!isEligibleImage(candidate)) continue;
        if (containsPoint(candidate.getBoundingClientRect()) && unobstructed(candidate)) {
          return candidate;
        }
      }
      if (scope.matches?.("article, [role='article']")) break;
    }
    return null;
  }

  function createSvgElement(tagName, attributes = {}) {
    const element =
      typeof document.createElementNS === "function"
        ? document.createElementNS("http://www.w3.org/2000/svg", tagName)
        : document.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute?.(name, String(value));
    }
    return element;
  }

  function createImageButtonIcon() {
    const svg = createSvgElement("svg", {
      "aria-hidden": "true",
      focusable: "false",
      viewBox: "0 0 24 24",
    });
    const paths = [
      {
        d: "M5 8h7M8.5 6v2c0 2.5-1.5 4.8-3.5 6",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-width": "1.8",
      },
      {
        d: "M6.5 11c.8 1.2 2 2.3 3.5 3",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-width": "1.8",
      },
      {
        d: "M13 18l3-8 3 8M14 15.5h4",
        fill: "none",
        stroke: "currentColor",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "stroke-width": "1.8",
      },
    ];
    svg.append?.(...paths.map((attrs) => createSvgElement("path", attrs)));
    return svg;
  }

  function setImageButtonState(
    img,
    state,
    progress = 0,
    action = "translate",
    ready = false,
  ) {
    const record = imageStates.get(img);
    const button = record?.button;
    if (!button) return;
    button.dataset.state = state;
    if (state === "gesture") {
      const turn = Math.min(Math.max(progress, 0), 1);
      button.style?.setProperty?.(
        "--touch-image-translate-progress",
        `${Math.round(turn * 360)}deg`,
        "important",
      );
      button.dataset.action = action;
      if (ready) button.dataset.ready = "true";
      else delete button.dataset.ready;
    } else {
      delete button.dataset.action;
      delete button.dataset.ready;
      button.style?.removeProperty?.("--touch-image-translate-progress");
    }
    const labels = {
      done: "View image translation",
      error: "Retry image translation",
      gesture: "Two-finger swipe right to translate image",
      idle: "Translate image",
      loading: "Cancel image translation",
    };
    button.setAttribute("aria-label", labels[state] || labels.idle);
    button.title = labels[state] || labels.idle;
    const isIdle = state === "idle";
    button.hidden = isIdle;
    if (record?.overlay) {
      record.overlay.hidden = isIdle;
      if (!isIdle && !record.positioned) {
        syncImageOverlay(img);
      }
    }
  }

  function applySpotlightToSvg(svgRoot, activeLabel = "") {
    if (!svgRoot) return;
    const active = String(activeLabel || "");
    const hasSelection = Boolean(active);
    for (const group of svgRoot.querySelectorAll?.(
      `.${IMAGE_REGION_CLASS}`,
    ) || []) {
      const region =
        group.dataset?.region || group.getAttribute?.("data-region");
      const isActive = Boolean(active && region === active);
      if (isActive) group.setAttribute?.("data-active", "true");
      else group.removeAttribute?.("data-active");
      const color = isActive ? "#f59e0b" : "#5865f2";
      const badgeOpacity = isActive ? "1" : hasSelection ? "0.48" : "0.86";
      const rects = group.querySelectorAll?.("rect") || [];
      if (rects[0]) {
        rects[0].setAttribute?.("fill", color);
        rects[0].setAttribute?.("fill-opacity", isActive ? "0.14" : "0");
        rects[0].setAttribute?.("stroke", color);
        rects[0].setAttribute?.("stroke-opacity", isActive ? "0.95" : "0");
      }
      if (rects[1]) {
        rects[1].setAttribute?.("fill", color);
        rects[1].setAttribute?.("opacity", badgeOpacity);
      }
      const textNode = group.querySelector?.("text");
      if (textNode) {
        textNode.setAttribute?.("opacity", badgeOpacity);
      }
    }
  }

  function setActiveImageRegion(img, regionLabel = "", { toggle = true } = {}) {
    const state = imageStates.get(img);
    if (!state) return;
    const requested = String(regionLabel || "");
    const next =
      toggle && state.activeRegion === requested ? "" : requested;
    state.activeRegion = next;
    if (activeImageViewer?.img === img) {
      activeImageViewer.syncActiveRegion(next);
    }
  }

  function closeImageViewer(invalidateIntent = true) {
    if (invalidateIntent) imageViewerIntent += 1;
    if (!activeImageViewer) return false;
    const viewer = activeImageViewer;
    activeImageViewer = null;
    viewer.cleanup?.();
    if (typeof viewer.dialog?.close === "function" && viewer.dialog.open) {
      viewer.dialog.close();
    }
    viewer.dialog?.remove?.();
    return true;
  }

  function removeImageTranslation(img) {
    const state = imageStates.get(img);
    if (!state) return false;
    state.activeRegion = "";
    state.regions = [];
    state.result = null;
    if (activeImageViewer?.img === img) {
      closeImageViewer(false);
    }
    if (!state.job) {
      setImageButtonState(img, "idle");
    }
    return true;
  }

  function buildSpotlightSvgElement(img, width, height, regions, activeRegion) {
    const items = computeRegionBoxLayout(width, height, regions);
    if (!items.length) return null;
    const active = String(activeRegion || "");
    const hasSelection = Boolean(active);
    const svg = createSvgElement("svg", {
      class: IMAGE_REGIONS_CLASS,
      viewBox: `0 0 ${width} ${height}`,
    });
    const groups = items.map((item) => {
      const isActive = active === item.label;
      const color = isActive ? "#f59e0b" : "#5865f2";
      const badgeOpacity = isActive ? "1" : hasSelection ? "0.48" : "0.86";
      const groupAttrs = {
        class: IMAGE_REGION_CLASS,
        "data-region": item.label,
      };
      if (isActive) groupAttrs["data-active"] = "true";
      const group = createSvgElement("g", groupAttrs);
      if (group.dataset) group.dataset.region = item.label;
      const boxRect = createSvgElement("rect", {
        fill: color,
        "fill-opacity": isActive ? "0.14" : "0",
        height: item.boxHeight,
        rx: 4,
        stroke: color,
        "stroke-opacity": isActive ? "0.95" : "0",
        "stroke-width": item.strokeWidth,
        width: item.boxWidth,
        x: item.x,
        y: item.y,
      });
      const labelRect = createSvgElement("rect", {
        fill: color,
        height: item.labelHeight,
        opacity: badgeOpacity,
        rx: 4,
        stroke: "#ffffff",
        "stroke-width": Math.max(1.5, item.strokeWidth - 0.5),
        width: item.labelWidth,
        x: item.labelX,
        y: item.labelY,
      });
      const textY =
        item.labelY +
        item.labelHeight / 2 +
        Math.round(item.fontSize * 0.35);
      const text = createSvgElement("text", {
        fill: "#ffffff",
        "font-family": "-apple-system, BlinkMacSystemFont, sans-serif",
        "font-size": item.fontSize,
        "font-weight": 700,
        opacity: badgeOpacity,
        "text-anchor": "middle",
        x: item.labelX + item.labelWidth / 2,
        y: textY,
      });
      text.textContent = item.label;
      const hitRect = createSvgElement("rect", {
        "aria-hidden": "true",
        fill: "transparent",
        "pointer-events": "all",
        width: 44,
        height: 44,
        x: item.labelX + (item.labelWidth - 44) / 2,
        y: item.labelY + (item.labelHeight - 44) / 2,
      });
      const pin = createSvgElement("g", {
        "data-pin-x": item.x,
        "data-pin-y": item.y,
      });
      pin.append?.(labelRect, text, hitRect);
      group.append?.(boxRect, pin);
      group.addEventListener?.("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        setActiveImageRegion(img, item.label, { toggle: true });
      });
      return group;
    });
    svg.append?.(...groups);
    return svg;
  }


  function syncImageOverlay(img) {
    const state = imageStates.get(img);
    if (!state?.overlay) return false;
    const src = String(img.currentSrc || img.src || "").trim();
    if (!img.isConnected || state.src !== src) {
      state.src = src;
      cancelImageJob(img);
      removeImageTranslation(img);
    }
    if (!img.isConnected) {
      state.overlay.remove?.();
      trackedImages.delete(img);
      return false;
    }
    trackedImages.add(img);
    const eligible =
      isTranslatableImage(img) ||
      Boolean(state.job) ||
      Boolean(state.result);
    if (!eligible) {
      if (!state.overlay.hidden) state.overlay.hidden = true;
      return false;
    }
    const anchor = imageAnchor(img);
    if (
      anchor?.parentElement &&
      state.overlay.nextElementSibling !== anchor
    ) {
      anchor.insertAdjacentElement("beforebegin", state.overlay);
    }
    const isIdle =
      (state.button?.dataset?.state || "idle") === "idle" &&
      !state.job &&
      !state.result;
    if (state.button) state.button.hidden = isIdle;
    state.overlay.hidden = isIdle;
    if (isIdle) return true;
    const rect = img.getBoundingClientRect?.() || {
      height: 0,
      left: 0,
      top: 0,
      width: 0,
    };
    const imageStyle = getComputedStyle(img);
    const box = imageContentBox(
      img.naturalWidth,
      img.naturalHeight,
      rect.width,
      rect.height,
      imageStyle?.objectFit,
      imageStyle?.objectPosition,
    );
    const targetX = Number(rect.left) || 0;
    const targetY = Number(rect.top) || 0;
    const currentRect = state.overlay.getBoundingClientRect?.();
    const needsPositionUpdate =
      !currentRect ||
      !state.positioned ||
      Math.abs((Number(currentRect.left) || 0) - targetX) > 0.5 ||
      Math.abs((Number(currentRect.top) || 0) - targetY) > 0.5 ||
      Math.abs((Number(currentRect.width) || 0) - rect.width) > 0.5 ||
      Math.abs((Number(currentRect.height) || 0) - rect.height) > 0.5;
    if (needsPositionUpdate) {
      let left = targetX;
      let top = targetY;
      if (currentRect) {
        state.overlay.style?.setProperty?.("left", "0px", "important");
        state.overlay.style?.setProperty?.("top", "0px", "important");
        const originRect = state.overlay.getBoundingClientRect?.() || {
          left: 0,
          top: 0,
        };
        left = targetX - (Number(originRect.left) || 0);
        top = targetY - (Number(originRect.top) || 0);
      }
      const width = Math.max(0, Math.round(rect.width * 100) / 100);
      const height = Math.max(0, Math.round(rect.height * 100) / 100);
      state.overlay.style?.setProperty?.(
        "left",
        `${Math.round(left * 100) / 100}px`,
        "important",
      );
      state.overlay.style?.setProperty?.(
        "top",
        `${Math.round(top * 100) / 100}px`,
        "important",
      );
      state.overlay.style?.setProperty?.("width", `${width}px`, "important");
      state.overlay.style?.setProperty?.("height", `${height}px`, "important");
      state.positioned = true;
    }
    const buttonTop = Math.max(8, Math.round(box.top + 8));
    const buttonRight = Math.max(
      8,
      Math.round(rect.width - (box.left + box.width) + 8),
    );
    state.button?.style?.setProperty?.("top", `${buttonTop}px`, "important");
    state.button?.style?.setProperty?.(
      "right",
      `${buttonRight}px`,
      "important",
    );
    return true;
  }

  function ensureImageOverlay(img) {
    if (!img?.isConnected) return null;
    let state = imageStates.get(img);
    if (!state) {
      const overlay = document.createElement("div");
      overlay.className = IMAGE_OVERLAY_CLASS;
      const button = document.createElement("button");
      button.type = "button";
      button.className = IMAGE_BUTTON_CLASS;
      button.append?.(createImageButtonIcon());
      button.addEventListener?.("click", (event) => {
        handleImageButtonClick(img, event);
      });
      overlay.append?.(button);
      state = {
        activeRegion: "",
        button,
        job: null,
        overlay,
        positioned: false,
        regions: [],
        result: null,
        src: String(img.currentSrc || img.src || "").trim(),
      };
      imageStates.set(img, state);
      setImageButtonState(img, "idle");
    }
    syncImageOverlay(img);
    return state;
  }

  // Image extraction & normalization

  function normalizedImageDimensions(width, height, maxEdge = IMAGE_MAX_EDGE) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return { height: 0, width: 0 };
    const longest = Math.max(w, h);
    if (longest <= maxEdge) {
      return { height: Math.round(h), width: Math.round(w) };
    }
    const scale = maxEdge / longest;
    return {
      height: Math.max(1, Math.round(h * scale)),
      width: Math.max(1, Math.round(w * scale)),
    };
  }

  function parseDataUrlImage(dataUrl) {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
      String(dataUrl || "").trim(),
    );
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const base64 = match[2].replace(/\s+/g, "");
    if (!base64) return null;
    const byteLength = Math.floor((base64.length * 3) / 4);
    return { base64, byteLength, mimeType };
  }

  function bytesToBase64(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < view.length; i += chunkSize) {
      binary += String.fromCharCode(...view.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function detectImageMimeType(bytes, headers = "", src = "") {
    const view =
      bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (
      view.length >= 4 &&
      view[0] === 0x89 &&
      view[1] === 0x50 &&
      view[2] === 0x4e &&
      view[3] === 0x47
    ) {
      return "image/png";
    }
    if (
      view.length >= 3 &&
      view[0] === 0xff &&
      view[1] === 0xd8 &&
      view[2] === 0xff
    ) {
      return "image/jpeg";
    }
    if (
      view.length >= 12 &&
      view[0] === 0x52 &&
      view[1] === 0x49 &&
      view[2] === 0x46 &&
      view[3] === 0x46 &&
      view[8] === 0x57 &&
      view[9] === 0x45 &&
      view[10] === 0x42 &&
      view[11] === 0x50
    ) {
      return "image/webp";
    }
    if (
      view.length >= 4 &&
      view[0] === 0x47 &&
      view[1] === 0x49 &&
      view[2] === 0x46 &&
      view[3] === 0x38
    ) {
      return "image/gif";
    }
    const headerMatch = /content-type:\s*(image\/[a-z0-9.+-]+)/i.exec(
      String(headers || ""),
    );
    if (headerMatch) return headerMatch[1].toLowerCase();
    if (/\.png(?:$|[?#])/i.test(src)) return "image/png";
    if (/\.webp(?:$|[?#])/i.test(src)) return "image/webp";
    if (/\.gif(?:$|[?#])/i.test(src)) return "image/gif";
    return "image/jpeg";
  }

  function buildImageTextProfile(imageData) {
    const width = Number(imageData?.width) || 0;
    const height = Number(imageData?.height) || 0;
    const data = imageData?.data;
    if (width < 16 || height < 16 || !data || data.length < width * height * 4) {
      return null;
    }
    const size = width * height;
    const luma = new Uint8Array(size);
    for (let i = 0, p = 0; i < size; i += 1, p += 4) {
      luma[i] =
        data[p + 3] < 32
          ? 255
          : (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    }
    // Bit 1 marks horizontal contrast (vertical stroke edges); bit 2 marks vertical contrast (horizontal stroke edges).
    const edge = new Uint8Array(size);
    for (let y = 1; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 1; x < width - 1; x += 1) {
        const idx = row + x;
        const cur = luma[idx];
        const gx = Math.max(
          Math.abs(cur - luma[idx - 1]),
          Math.abs(luma[idx + 1] - cur),
        );
        const gy = Math.max(
          Math.abs(cur - luma[idx - width]),
          Math.abs(luma[idx + width] - cur),
        );
        if (gx >= 30 || gy >= 30) {
          edge[idx] = (gx >= 30 ? 1 : 0) | (gy >= 30 ? 2 : 0);
        }
      }
    }
    return { edge, height, luma, width };
  }

  function snapBoxToInk(box_2d, profile) {
    if (!Array.isArray(box_2d) || box_2d.length !== 4) return null;
    const coords = box_2d.map((item) => Math.round(Number(item)));
    if (coords.some((item) => !Number.isFinite(item))) return null;
    const [ymin, xmin, ymax, xmax] = coords;
    if (ymin < 0 || xmin < 0 || ymax > 1000 || xmax > 1000 || ymin >= ymax || xmin >= xmax) {
      return null;
    }
    if (!profile?.edge || !(profile.width >= 16) || !(profile.height >= 16)) {
      return [ymin, xmin, ymax, xmax];
    }
    const { edge, width, height } = profile;
    const x0 = clampNumber(Math.floor((xmin / 1000) * width), 0, width - 1);
    const y0 = clampNumber(Math.floor((ymin / 1000) * height), 0, height - 1);
    const x1 = clampNumber(Math.ceil((xmax / 1000) * width) - 1, x0, width - 1);
    const y1 = clampNumber(Math.ceil((ymax / 1000) * height) - 1, y0, height - 1);

    // Require vertical-stroke transitions on rows and horizontal-stroke transitions on columns so straight borders are skipped.
    const rowHasInk = (y, left, right) => {
      if (y < 0 || y >= height) return false;
      const base = y * width;
      let gx = 0;
      let gy = 0;
      for (let x = left; x <= right; x += 1) {
        const val = edge[base + x];
        if (val & 1) gx += 1;
        if (val & 2) gy += 1;
      }
      return gx >= 2 && gx + gy >= 3;
    };

    const colHasInk = (x, top, bottom) => {
      if (x < 0 || x >= width) return false;
      let gx = 0;
      let gy = 0;
      for (let y = top; y <= bottom; y += 1) {
        const val = edge[y * width + x];
        if (val & 1) gx += 1;
        if (val & 2) gy += 1;
      }
      return gy >= 2 && gx + gy >= 3;
    };

    let top = y0;
    while (top <= y1 && !rowHasInk(top, x0, x1)) top += 1;
    if (top > y1) return [ymin, xmin, ymax, xmax];
    let bottom = y1;
    while (bottom >= top && !rowHasInk(bottom, x0, x1)) bottom -= 1;

    let left = x0;
    while (left <= x1 && !colHasInk(left, top, bottom)) left += 1;
    if (left > x1) return [ymin, xmin, ymax, xmax];
    let right = x1;
    while (right >= left && !colHasInk(right, top, bottom)) right -= 1;

    while (top < bottom && !rowHasInk(top, left, right)) top += 1;
    while (bottom > top && !rowHasInk(bottom, left, right)) bottom -= 1;

    const maxExpandY = Math.max(3, Math.round(height * 0.02));
    const maxExpandX = Math.max(4, Math.round(width * 0.025));
    for (let step = 0; step < maxExpandY && top > 0; step += 1) {
      if (rowHasInk(top - 1, left, right)) top -= 1;
      else if (top > 1 && rowHasInk(top - 2, left, right)) top -= 2;
      else break;
    }
    for (let step = 0; step < maxExpandY && bottom < height - 1; step += 1) {
      if (rowHasInk(bottom + 1, left, right)) bottom += 1;
      else if (bottom < height - 2 && rowHasInk(bottom + 2, left, right)) bottom += 2;
      else break;
    }
    for (let step = 0; step < maxExpandX && left > 0; step += 1) {
      if (colHasInk(left - 1, top, bottom)) left -= 1;
      else if (left > 1 && colHasInk(left - 2, top, bottom)) left -= 2;
      else break;
    }
    for (let step = 0; step < maxExpandX && right < width - 1; step += 1) {
      if (colHasInk(right + 1, top, bottom)) right += 1;
      else if (right < width - 2 && colHasInk(right + 2, top, bottom)) right += 2;
      else break;
    }

    const padX = Math.min(2, Math.floor(width * 0.003) + 1);
    const padY = Math.min(2, Math.floor(height * 0.003) + 1);
    const sYmin = clampNumber(Math.floor(((top - padY) / height) * 1000), 0, 992);
    const sXmin = clampNumber(Math.floor(((left - padX) / width) * 1000), 0, 992);
    const sYmax = clampNumber(Math.ceil(((bottom + 1 + padY) / height) * 1000), sYmin + 8, 1000);
    const sXmax = clampNumber(Math.ceil(((right + 1 + padX) / width) * 1000), sXmin + 8, 1000);
    return [sYmin, sXmin, sYmax, sXmax];
  }

  function detectImageTextBoxes(profile) {
    if (!profile?.edge || !(profile.width >= 16) || !(profile.height >= 16)) {
      return [];
    }
    const { edge, width, height } = profile;
    const cellSize = clampNumber(Math.round(Math.max(width, height) / 240), 3, 6);
    const gridW = Math.ceil(width / cellSize);
    const gridH = Math.ceil(height / cellSize);
    const gridSize = gridW * gridH;
    const cellGx = new Uint8Array(gridSize);
    const cellGy = new Uint8Array(gridSize);

    for (let cy = 0; cy < gridH; cy += 1) {
      const yStart = cy * cellSize;
      const yEnd = Math.min(height, yStart + cellSize);
      for (let cx = 0; cx < gridW; cx += 1) {
        const xStart = cx * cellSize;
        const xEnd = Math.min(width, xStart + cellSize);
        let gx = 0;
        let gy = 0;
        for (let y = yStart; y < yEnd; y += 1) {
          const row = y * width;
          for (let x = xStart; x < xEnd; x += 1) {
            const val = edge[row + x];
            if (val & 1) gx += 1;
            if (val & 2) gy += 1;
          }
        }
        const idx = cy * gridW + cx;
        cellGx[idx] = Math.min(255, gx);
        cellGy[idx] = Math.min(255, gy);
      }
    }

    const active = new Uint8Array(gridSize);
    for (let cy = 0; cy < gridH; cy += 1) {
      for (let cx = 0; cx < gridW; cx += 1) {
        const idx = cy * gridW + cx;
        if (cellGx[idx] + cellGy[idx] < 2) continue;
        let sumGx = 0;
        let sumGy = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny >= gridH) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            if (nx < 0 || nx >= gridW) continue;
            const nIdx = ny * gridW + nx;
            sumGx += cellGx[nIdx];
            sumGy += cellGy[nIdx];
          }
        }
        if (sumGx >= 3 && sumGy >= 3 && sumGx * 8 >= sumGy && sumGy * 8 >= sumGx) {
          active[idx] = 1;
        }
      }
    }

    const dilated = new Uint8Array(gridSize);
    for (let cy = 0; cy < gridH; cy += 1) {
      for (let cx = 0; cx < gridW; cx += 1) {
        if (!active[cy * gridW + cx]) continue;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny >= gridH) continue;
          for (let dx = -2; dx <= 2; dx += 1) {
            const nx = cx + dx;
            if (nx >= 0 && nx < gridW) dilated[ny * gridW + nx] = 1;
          }
        }
      }
    }

    const visited = new Uint8Array(gridSize);
    const queue = new Int32Array(gridSize);
    const rawItems = [];

    for (let start = 0; start < gridSize; start += 1) {
      if (!dilated[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      let minCx = gridW;
      let minCy = gridH;
      let maxCx = 0;
      let maxCy = 0;
      let activeCount = 0;
      let energy = 0;

      while (head < tail) {
        const cur = queue[head++];
        const cy = Math.floor(cur / gridW);
        const cx = cur - cy * gridW;
        if (active[cur]) {
          activeCount += 1;
          energy += cellGx[cur] + cellGy[cur];
          if (cx < minCx) minCx = cx;
          if (cy < minCy) minCy = cy;
          if (cx > maxCx) maxCx = cx;
          if (cy > maxCy) maxCy = cy;
        }
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = cy + dy;
          if (ny < 0 || ny >= gridH) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = cx + dx;
            if (nx < 0 || nx >= gridW) continue;
            const next = ny * gridW + nx;
            if (dilated[next] && !visited[next]) {
              visited[next] = 1;
              queue[tail++] = next;
            }
          }
        }
      }

      if (activeCount < 2 || energy < 8) continue;
      const cellSpan = (maxCx - minCx + 1) * (maxCy - minCy + 1);
      const rawBox = [
        clampNumber(Math.floor(((minCy * cellSize) / height) * 1000), 0, 992),
        clampNumber(Math.floor(((minCx * cellSize) / width) * 1000), 0, 992),
        clampNumber(Math.ceil((((maxCy + 1) * cellSize) / height) * 1000), 8, 1000),
        clampNumber(Math.ceil((((maxCx + 1) * cellSize) / width) * 1000), 8, 1000),
      ];
      const snapped = snapBoxToInk(rawBox, profile);
      if (!snapped) continue;
      const [ymin, xmin, ymax, xmax] = snapped;
      const boxW = xmax - xmin;
      const boxH = ymax - ymin;
      if (boxW < 8 || boxH < 8) continue;
      if ((boxW / 1000) * width < 7 || (boxH / 1000) * height < 7) continue;
      if (boxW > 900 && boxH > 900 && activeCount / Math.max(1, cellSpan) < 0.08) continue;
      rawItems.push({ box_2d: snapped, energy });
    }

    if (!rawItems.length) return [];

    // Merge consecutive lines in the same paragraph or vertical columns in the same speech bubble.
    const consumed = new Array(rawItems.length).fill(false);
    const merged = [];
    for (let i = 0; i < rawItems.length; i += 1) {
      if (consumed[i]) continue;
      const cur = { box_2d: [...rawItems[i].box_2d], energy: rawItems[i].energy };
      consumed[i] = true;
      let changed = true;
      while (changed) {
        changed = false;
        for (let j = i + 1; j < rawItems.length; j += 1) {
          if (consumed[j]) continue;
          const next = rawItems[j];
          const [ay0, ax0, ay1, ax1] = cur.box_2d;
          const [by0, bx0, by1, bx1] = next.box_2d;
          const aW = Math.max(1, ax1 - ax0);
          const aH = Math.max(1, ay1 - ay0);
          const bW = Math.max(1, bx1 - bx0);
          const bH = Math.max(1, by1 - by0);
          const vGap = Math.max(ay0, by0) - Math.min(ay1, by1);
          const hGap = Math.max(ax0, bx0) - Math.min(ax1, bx1);
          const overlapX = Math.min(ax1, bx1) - Math.max(ax0, bx0);
          const overlapY = Math.min(ay1, by1) - Math.max(ay0, by0);

          const isHorizontalPair =
            vGap >= -6 &&
            vGap <= Math.min(18, Math.min(aH, bH) * 0.55) &&
            Math.max(aH, bH) <= 75 &&
            Math.max(ay1, by1) - Math.min(ay0, by0) <= 260 &&
            Math.abs(ax0 - bx0) <= 22 &&
            overlapX / Math.max(aW, bW) >= 0.7;

          const isVerticalPair =
            aH >= aW * 1.4 &&
            bH >= bW * 1.4 &&
            Math.max(aW, bW) <= 85 &&
            hGap >= -6 &&
            hGap <= Math.min(22, Math.min(aW, bW) * 0.9) &&
            Math.max(ax1, bx1) - Math.min(ax0, bx0) <= 260 &&
            Math.abs(ay0 - by0) <= 35 &&
            overlapY / Math.min(aH, bH) >= 0.6;

          if (!isHorizontalPair && !isVerticalPair) continue;
          const unionBox = [
            Math.min(ay0, by0),
            Math.min(ax0, bx0),
            Math.max(ay1, by1),
            Math.max(ax1, bx1),
          ];
          cur.box_2d = snapBoxToInk(unionBox, profile) || unionBox;
          cur.energy += next.energy;
          consumed[j] = true;
          changed = true;
        }
      }
      merged.push(cur);
    }

    const capped =
      merged.length > 48
        ? merged
            .sort((a, b) => b.energy - a.energy)
            .slice(0, 48)
        : merged;

    capped.sort((a, b) => {
      const bandA = Math.floor(a.box_2d[0] / 35);
      const bandB = Math.floor(b.box_2d[0] / 35);
      return bandA !== bandB ? bandA - bandB : a.box_2d[1] - b.box_2d[1];
    });

    return capped.map((item, index) => ({
      box_2d: item.box_2d,
      id: index + 1,
    }));
  }

  function drawCandidateBoxesOnCanvas(ctx, width, height, candidates) {
    if (!ctx || !Array.isArray(candidates) || !candidates.length) return;
    ctx.save?.();
    const fontSize = clampNumber(Math.round(Math.min(width, height) / 64), 10, 14);
    const badgeH = fontSize + 4;
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const candidate of candidates) {
      const [ymin, xmin, ymax, xmax] = candidate.box_2d;
      const x = clampNumber(Math.round((xmin / 1000) * width) - 2, 0, width - 1);
      const y = clampNumber(Math.round((ymin / 1000) * height) - 2, 0, height - 1);
      const w = clampNumber(Math.round(((xmax - xmin) / 1000) * width) + 4, 2, width - x);
      const h = clampNumber(Math.round(((ymax - ymin) / 1000) * height) + 4, 2, height - y);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(225, 29, 72, 0.85)";
      ctx.strokeRect?.(x, y, w, h);

      const label = String(candidate.id);
      const badgeW = Math.max(badgeH, Math.round(fontSize * (0.7 + label.length * 0.58)));
      const bx = x >= badgeW + 2 ? x - badgeW - 1 : clampNumber(x, 0, Math.max(0, width - badgeW));
      const by =
        x >= badgeW + 2
          ? clampNumber(y, 0, Math.max(0, height - badgeH))
          : y >= badgeH + 2
            ? y - badgeH - 1
            : clampNumber(y, 0, Math.max(0, height - badgeH));
      ctx.fillStyle = "rgba(225, 29, 72, 0.94)";
      ctx.fillRect?.(bx, by, badgeW, badgeH);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect?.(bx, by, badgeW, badgeH);
      ctx.fillStyle = "#ffffff";
      ctx.fillText?.(label, bx + badgeW / 2, by + badgeH / 2 + 0.5);
    }
    ctx.restore?.();
  }

  function rasterizeDrawableToBase64(drawable, width, height) {
    try {
      const dims = normalizedImageDimensions(width, height);
      if (!dims.width || !dims.height) return null;
      const canvas = document.createElement?.("canvas");
      if (!canvas || typeof canvas.getContext !== "function") return null;
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext("2d");
      if (!ctx || typeof ctx.drawImage !== "function") return null;
      ctx.drawImage(drawable, 0, 0, dims.width, dims.height);
      let profile = null;
      let candidates = [];
      if (typeof ctx.getImageData === "function") {
        try {
          const pixels = ctx.getImageData(0, 0, dims.width, dims.height);
          profile = buildImageTextProfile(pixels);
          if (profile) {
            candidates = detectImageTextBoxes(profile);
            if (candidates.length) {
              drawCandidateBoxesOnCanvas(ctx, dims.width, dims.height, candidates);
            }
          }
        } catch {
          // Canvas pixel read may fail if tainted; proceed with raw rasterization.
        }
      }
      const dataUrl = canvas.toDataURL("image/png");
      const parsed = parseDataUrlImage(dataUrl);
      if (!parsed) return null;
      return {
        ...parsed,
        candidates,
        height: dims.height,
        profile,
        width: dims.width,
      };
    } catch {
      return null;
    }
  }

  async function extractNormalizedImage(img, onCancelReady) {
    const src = String(img?.currentSrc || img?.src || "").trim();
    if (!src) throw new Error("Image has no source URL");
    const parsedDataUrl = parseDataUrlImage(src);
    if (parsedDataUrl) {
      if (parsedDataUrl.byteLength > IMAGE_MAX_BYTES) {
        throw new Error("Image is too large to translate (limit: 10 MB).");
      }
      if (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        const rasterized = rasterizeDrawableToBase64(
          img,
          img.naturalWidth,
          img.naturalHeight,
        );
        if (rasterized) return rasterized;
      }
      return parsedDataUrl;
    }

    if (img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const rasterized = rasterizeDrawableToBase64(
        img,
        img.naturalWidth,
        img.naturalHeight,
      );
      if (rasterized && rasterized.byteLength <= IMAGE_MAX_BYTES) {
        return rasterized;
      }
    }

    const response = await new Promise((resolve, reject) => {
      let request;
      try {
        request = GM_xmlhttpRequest({
          method: "GET",
          url: src,
          responseType: "arraybuffer",
          timeout: 30000,
          onload: resolve,
          onerror: () => reject(new Error("Could not load the image.")),
          ontimeout: () => reject(new Error("Loading the image timed out.")),
          onabort: () => reject(cancelledError()),
        });
      } catch (error) {
        reject(error);
        return;
      }
      onCancelReady?.(() => request?.abort?.());
    });

    if (response.status && (response.status < 200 || response.status >= 300)) {
      throw new Error(`Could not load the image (HTTP ${response.status}).`);
    }

    let rawBytes = null;
    const payload = response.response ?? response.responseText;
    if (ArrayBuffer.isView(payload)) {
      rawBytes = new Uint8Array(
        payload.buffer,
        payload.byteOffset,
        payload.byteLength,
      );
    } else if (
      payload instanceof ArrayBuffer ||
      Object.prototype.toString.call(payload) === "[object ArrayBuffer]" ||
      (payload &&
        typeof payload === "object" &&
        typeof payload.byteLength === "number")
    ) {
      rawBytes = new Uint8Array(payload);
    } else if (typeof Blob !== "undefined" && payload instanceof Blob) {
      if (payload.size > IMAGE_MAX_BYTES) {
        throw new Error("Image is too large to translate (limit: 10 MB).");
      }
      rawBytes = new Uint8Array(await payload.arrayBuffer());
    } else if (typeof payload === "string" && payload) {
      const parsed = parseDataUrlImage(payload);
      if (parsed) return parsed;
    }

    if (!rawBytes || !rawBytes.byteLength) {
      throw new Error("The downloaded image was empty.");
    }
    if (rawBytes.byteLength > IMAGE_MAX_BYTES) {
      throw new Error("Image is too large to translate (limit: 10 MB).");
    }

    const mimeType = detectImageMimeType(
      rawBytes,
      response.responseHeaders,
      src,
    );
    if (
      typeof createImageBitmap === "function" &&
      typeof Blob === "function"
    ) {
      try {
        const bitmap = await createImageBitmap(
          new Blob([rawBytes], { type: mimeType }),
        );
        try {
          if (bitmap.width * bitmap.height > IMAGE_MAX_PIXELS * 4) {
            throw new Error("Image dimensions are too large to translate.");
          }
          const rasterized = rasterizeDrawableToBase64(
            bitmap,
            bitmap.width,
            bitmap.height,
          );
          if (rasterized) return rasterized;
        } finally {
          bitmap.close?.();
        }
      } catch (error) {
        if (/dimensions are too large/i.test(error?.message || "")) throw error;
      }
    }

    const base64 = bytesToBase64(rawBytes);
    return {
      base64,
      byteLength: rawBytes.byteLength,
      mimeType,
    };
  }
