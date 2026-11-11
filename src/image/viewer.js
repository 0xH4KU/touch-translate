  function storeImageResult(img, result) {
    if (!img?.isConnected) return null;
    const regions = Array.isArray(result?.regions) ? result.regions : [];
    const translation =
      typeof result === "string" ? result : result?.translation;
    if (!regions.length || !normalizeText(translation)) return null;
    const normalizedResult = {
      hasText: true,
      regions,
      translation,
    };

    const state = ensureImageOverlay(img);
    if (state) {
      state.regions = regions;
      state.result = normalizedResult;
      state.activeRegion = "1";
      setImageButtonState(img, "done");
    }

    return normalizedResult;
  }

  function openImageViewer(img, result) {
    const normalized = storeImageResult(img, result);
    if (!normalized) return null;
    const { regions } = normalized;
    const state = imageStates.get(img);
    imageViewerIntent += 1;
    closeImageViewer(false);

    const dialog = document.createElement("dialog");
    dialog.className = IMAGE_VIEWER_CLASS;
    dialog.dataset.touchTranslateUi = "";
    dialog.setAttribute("aria-label", "Image translation viewer");

    // Top bar
    const topBar = document.createElement("div");
    topBar.className = IMAGE_VIEWER_BAR_CLASS;

    const counter = document.createElement("span");
    counter.dataset.viewerCounter = "";
    counter.textContent = `Region 1 / ${regions.length}`;

    const barActions = document.createElement("div");

    const togglePinsBtn = document.createElement("button");
    togglePinsBtn.type = "button";
    togglePinsBtn.dataset.action = "toggle-pins";
    togglePinsBtn.textContent = "Hide pins";

    const resetZoomBtn = document.createElement("button");
    resetZoomBtn.type = "button";
    resetZoomBtn.dataset.action = "reset-zoom";
    resetZoomBtn.textContent = "100%";
    resetZoomBtn.hidden = true;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.dataset.action = "clear";
    clearBtn.textContent = "Clear";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.dataset.action = "close";
    closeBtn.setAttribute("aria-label", "Close viewer");
    closeBtn.textContent = "Close";

    barActions.append(togglePinsBtn, resetZoomBtn, clearBtn, closeBtn);
    topBar.append(counter, barActions);

    // Zoom & pan stage
    const stage = document.createElement("div");
    stage.className = IMAGE_VIEWER_STAGE_CLASS;

    const canvas = document.createElement("div");
    canvas.className = IMAGE_VIEWER_CANVAS_CLASS;

    const viewerImg = document.createElement("img");
    viewerImg.className = IMAGE_VIEWER_IMG_CLASS;
    viewerImg.src = String(img.currentSrc || img.src || "").trim();
    viewerImg.alt = img.alt || "Translated image";
    canvas.append(viewerImg);

    let svg = null;
    stage.append(canvas);

    // Bottom floating sheet
    const sheet = document.createElement("div");
    sheet.className = IMAGE_VIEWER_SHEET_CLASS;

    const sheetHeader = document.createElement("div");
    sheetHeader.dataset.sheetHeader = "";

    const navGroup = document.createElement("div");
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.dataset.action = "prev-region";
    prevBtn.setAttribute("aria-label", "Previous region");
    prevBtn.textContent = "Prev";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.dataset.action = "next-region";
    nextBtn.setAttribute("aria-label", "Next region");
    nextBtn.textContent = "Next";
    navGroup.append(prevBtn, nextBtn);

    const hasSource = regions.some((region) => normalizeText(region?.source));
    const sheetActions = document.createElement("div");

    const sourceBtn = document.createElement("button");
    sourceBtn.type = "button";
    sourceBtn.dataset.action = "toggle-source";
    sourceBtn.textContent = "Original";
    sourceBtn.hidden = !hasSource;

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.dataset.action = "toggle-expand";
    expandBtn.textContent = `All (${regions.length})`;

    if (regions.length <= 1) {
      navGroup.hidden = true;
      expandBtn.hidden = true;
      if (!hasSource) sheetHeader.hidden = true;
    }
    sheetActions.append(sourceBtn, expandBtn);
    sheetHeader.append(navGroup, sheetActions);

    const activeCard = document.createElement("div");
    activeCard.className = IMAGE_VIEWER_ACTIVE_CLASS;
    const activeBadge = document.createElement("span");
    activeBadge.className = IMAGE_BADGE_CLASS;
    const activeBody = document.createElement("div");
    const activeSource = document.createElement("div");
    activeSource.className = IMAGE_SOURCE_CLASS;
    activeSource.hidden = true;
    const activeText = document.createElement("div");
    activeText.className = IMAGE_TEXT_CLASS;
    activeBody.append(activeSource, activeText);
    activeCard.append(activeBadge, activeBody);

    const listContainer = document.createElement("div");
    listContainer.className = IMAGE_VIEWER_LIST_CLASS;
    listContainer.hidden = true;

    const listItems = regions.map((region, index) => {
      const label = String(index + 1);
      const item = document.createElement("div");
      item.className = IMAGE_ITEM_CLASS;
      if (item.dataset) item.dataset.region = label;
      item.setAttribute?.("data-region", label);
      const badge = document.createElement("span");
      badge.className = IMAGE_BADGE_CLASS;
      badge.textContent = label;
      const bodyWrap = document.createElement("div");
      if (normalizeText(region.source)) {
        const sourceDiv = document.createElement("div");
        sourceDiv.className = IMAGE_SOURCE_CLASS;
        assembleTranslatedContent(sourceDiv, region.source);
        bodyWrap.append(sourceDiv);
      }
      const textSpan = document.createElement("div");
      textSpan.className = IMAGE_TEXT_CLASS;
      assembleTranslatedContent(textSpan, region.translation || "");
      bodyWrap.append(textSpan);
      item.append(badge, bodyWrap);
      item.addEventListener?.("click", (event) => {
        event.stopPropagation?.();
        setActiveImageRegion(img, label, { toggle: true });
        if (state?.activeRegion) panToRegion(region);
      });
      return item;
    });
    listContainer.replaceChildren(...listItems);

    sheet.append(sheetHeader, activeCard, listContainer);
    dialog.append(topBar, stage, sheet);
    (document.body || document.documentElement).append(dialog);

    // Zoom & Pan state
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let expanded = false;
    let pinsHidden = false;
    let showSource = false;

    // Keep pins and touch targets at screen size while the image zooms.
    const syncPinScale = () => {
      for (const pin of svg?.querySelectorAll?.("[data-pin-x]") || []) {
        const x = Number(pin.getAttribute("data-pin-x"));
        const y = Number(pin.getAttribute("data-pin-y"));
        pin.setAttribute("transform", `translate(${x} ${y}) scale(${1 / scale}) translate(${-x} ${-y})`);
      }
    };

    const updateTransform = () => {
      if (scale <= 1.01) {
        scale = 1;
        panX = 0;
        panY = 0;
      }
      canvas.style?.setProperty?.(
        "transform",
        `translate3d(${Math.round(panX)}px, ${Math.round(panY)}px, 0) scale(${Math.round(scale * 1000) / 1000})`,
        "important",
      );
      resetZoomBtn.hidden = scale <= 1.01;
      resetZoomBtn.textContent = `${Math.round(scale * 100)}%`;
      syncPinScale();
    };

    let renderedWidth = 0;
    let renderedHeight = 0;
    const syncRegions = () => {
      if (!dialog.isConnected || !viewerImg.complete || !viewerImg.naturalWidth) return;
      const rect = viewerImg.getBoundingClientRect?.();
      const transformScale = Math.round(scale * 1000) / 1000;
      const width = rect?.width / transformScale || 0;
      const height = rect?.height / transformScale || 0;
      if (!width || !height || (width === renderedWidth && height === renderedHeight)) return;
      renderedWidth = width;
      renderedHeight = height;
      svg?.remove();
      svg = buildSpotlightSvgElement(img, width, height, regions, state?.activeRegion || "");
      if (svg) canvas.append(svg);
      syncPinScale();
    };
    viewerImg.addEventListener?.("load", syncRegions);
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(syncRegions)
      : null;
    if (resizeObserver) resizeObserver.observe(viewerImg);
    else globalThis.addEventListener?.("resize", syncRegions);

    const stageMetrics = () => {
      const rect = stage.getBoundingClientRect?.();
      const width = Number(rect?.width) || 0;
      const height = Number(rect?.height) || 0;
      return {
        height,
        width,
        x: (Number(rect?.left) || 0) + width / 2,
        y: (Number(rect?.top) || 0) + height / 2,
      };
    };

    const clampPan = (nextX, nextY, nextScale = scale) => {
      if (nextScale <= 1.01) return { x: 0, y: 0 };
      const { width: stageW, height: stageH } = stageMetrics();
      const baseW = renderedWidth || stageW;
      const baseH = renderedHeight || stageH;
      if (!baseW || !baseH) return { x: nextX, y: nextY };
      const maxX =
        Math.max(0, (baseW * nextScale - Math.min(stageW || baseW, baseW)) / 2) + 24;
      const maxY =
        Math.max(0, (baseH * nextScale - Math.min(stageH || baseH, baseH)) / 2) + 24;
      return {
        x: clampNumber(nextX, -maxX, maxX),
        y: clampNumber(nextY, -maxY, maxY),
      };
    };

    const setZoom = (nextScale, clientX, clientY) => {
      const clamped = clampNumber(nextScale, 1, 5);
      if (clamped <= 1.01) {
        scale = 1;
        panX = 0;
        panY = 0;
      } else {
        const center = stageMetrics();
        const fx = Number.isFinite(clientX) ? clientX - center.x : 0;
        const fy = Number.isFinite(clientY) ? clientY - center.y : 0;
        const ratio = clamped / scale;
        const next = clampPan(
          fx - (fx - panX) * ratio,
          fy - (fy - panY) * ratio,
          clamped,
        );
        panX = next.x;
        panY = next.y;
        scale = clamped;
      }
      updateTransform();
    };

    const panToRegion = (region) => {
      if (scale <= 1.01 || !Array.isArray(region?.box_2d)) return;
      const { width: stageW, height: stageH } = stageMetrics();
      const baseW = renderedWidth || stageW;
      const baseH = renderedHeight || stageH;
      if (!baseW || !baseH) return;
      const [ymin, xmin, ymax, xmax] = region.box_2d;
      const u = ((xmin + xmax) / 2000 - 0.5) * baseW;
      const v = ((ymin + ymax) / 2000 - 0.5) * baseH;
      const viewW = stageW || baseW;
      const viewH = stageH || baseH;
      if (
        Math.abs(panX + u * scale) > viewW * 0.36 ||
        Math.abs(panY + v * scale) > viewH * 0.36
      ) {
        const next = clampPan(-u * scale, -v * scale, scale);
        panX = next.x;
        panY = next.y;
        updateTransform();
      }
    };

    const syncActiveRegion = (activeLabel) => {
      const label = String(activeLabel || "");
      applySpotlightToSvg(svg, label);
      let activeItem = null;
      for (const item of listItems) {
        const itemRegion =
          item.dataset?.region || item.getAttribute?.("data-region");
        if (label && itemRegion === label) {
          item.setAttribute?.("data-active", "true");
          activeItem = item;
        } else {
          item.removeAttribute?.("data-active");
        }
      }
      if (expanded && activeItem) {
        activeItem.scrollIntoView?.({ block: "nearest" });
      }
      const activeIndex = label
        ? clampNumber(Number(label) - 1, 0, regions.length - 1)
        : 0;
      const shownRegion = regions[activeIndex];
      const shownLabel = String(activeIndex + 1);
      activeBadge.textContent = shownLabel;
      if (label) {
        activeCard.setAttribute?.("data-active", "true");
        counter.textContent = `Region ${shownLabel} / ${regions.length}`;
      } else {
        activeCard.removeAttribute?.("data-active");
        counter.textContent = `${regions.length} regions (tap a pin)`;
      }
      const sourceValue = shownRegion?.source || "";
      activeSource.hidden = !showSource || !normalizeText(sourceValue);
      assembleTranslatedContent(activeSource, sourceValue);
      assembleTranslatedContent(activeText, shownRegion?.translation || "");
    };

    const stepRegion = (delta) => {
      const currentNum = Number(state?.activeRegion) || 1;
      const nextNum =
        ((currentNum - 1 + delta + regions.length) % regions.length) + 1;
      setActiveImageRegion(img, String(nextNum), { toggle: false });
      panToRegion(regions[nextNum - 1]);
    };

    prevBtn.addEventListener?.("click", () => stepRegion(-1));
    nextBtn.addEventListener?.("click", () => stepRegion(1));

    sourceBtn.addEventListener?.("click", () => {
      showSource = !showSource;
      if (showSource) dialog.setAttribute?.("data-show-source", "true");
      else dialog.removeAttribute?.("data-show-source");
      sourceBtn.textContent = showSource ? "Hide original" : "Original";
      syncActiveRegion(state?.activeRegion || "1");
    });

    expandBtn.addEventListener?.("click", () => {
      expanded = !expanded;
      listContainer.hidden = !expanded;
      if (expanded) dialog.setAttribute?.("data-expanded", "true");
      else dialog.removeAttribute?.("data-expanded");
      expandBtn.textContent = expanded
        ? "Collapse"
        : `All (${regions.length})`;
    });

    togglePinsBtn.addEventListener?.("click", () => {
      pinsHidden = !pinsHidden;
      if (pinsHidden) dialog.setAttribute?.("data-hide-pins", "true");
      else dialog.removeAttribute?.("data-hide-pins");
      togglePinsBtn.textContent = pinsHidden ? "Show pins" : "Hide pins";
    });

    resetZoomBtn.addEventListener?.("click", () => {
      setZoom(1);
    });

    clearBtn.addEventListener?.("click", () => {
      removeImageTranslation(img);
    });

    closeBtn.addEventListener?.("click", () => {
      closeImageViewer();
    });

    dialog.addEventListener?.("cancel", () => {
      closeImageViewer();
    });

    dialog.addEventListener?.("keydown", (event) => {
      if (event.key === "ArrowLeft" && regions.length > 1) {
        event.preventDefault?.();
        stepRegion(-1);
      } else if (event.key === "ArrowRight" && regions.length > 1) {
        event.preventDefault?.();
        stepRegion(1);
      } else if (event.key === "0" && scale > 1.01) {
        event.preventDefault?.();
        setZoom(1);
      }
    });

    if (regions.length > 1) {
      let cardSwipe = null;
      activeCard.addEventListener?.(
        "touchstart",
        (event) => {
          const t = event.touches?.length === 1 ? event.touches[0] : null;
          cardSwipe = t ? { x: t.clientX, y: t.clientY } : null;
        },
        { passive: true },
      );
      activeCard.addEventListener?.(
        "touchend",
        (event) => {
          const t = cardSwipe && !event.touches?.length ? event.changedTouches?.[0] : null;
          const start = cardSwipe;
          cardSwipe = null;
          if (!t || globalThis.getSelection?.()?.toString?.()) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            stepRegion(dx < 0 ? 1 : -1);
          }
        },
        { passive: true },
      );
    }

    // Touch pinch-to-zoom, 1-finger pan, pull-down close, and focal double-tap zoom on stage
    let gestureState = null;
    let lastTap = null;

    stage.addEventListener?.(
      "touchstart",
      (event) => {
        if (event.touches?.length === 2) {
          const [t1, t2] = event.touches;
          const dist = Math.hypot(
            t2.clientX - t1.clientX,
            t2.clientY - t1.clientY,
          );
          const center = stageMetrics();
          gestureState = {
            mode: "pinch",
            startDist: Math.max(10, dist),
            startFx: (t1.clientX + t2.clientX) / 2 - center.x,
            startFy: (t1.clientY + t2.clientY) / 2 - center.y,
            startPanX: panX,
            startPanY: panY,
            startScale: scale,
          };
        } else if (event.touches?.length === 1) {
          const t = event.touches[0];
          gestureState = {
            lastX: t.clientX,
            lastY: t.clientY,
            mode: "pan",
            moved: false,
            onPin: Boolean(event.target?.closest?.(`.${IMAGE_REGION_CLASS}`)),
            startPanX: panX,
            startPanY: panY,
            startX: t.clientX,
            startY: t.clientY,
          };
        }
      },
      { passive: true },
    );

    stage.addEventListener?.(
      "touchmove",
      (event) => {
        if (!gestureState) return;
        if (gestureState.mode === "pinch" && event.touches?.length === 2) {
          if (event.cancelable) event.preventDefault();
          const [t1, t2] = event.touches;
          const dist = Math.hypot(
            t2.clientX - t1.clientX,
            t2.clientY - t1.clientY,
          );
          const nextScale = clampNumber(
            gestureState.startScale * (dist / gestureState.startDist),
            1,
            5,
          );
          const center = stageMetrics();
          const curFx = (t1.clientX + t2.clientX) / 2 - center.x;
          const curFy = (t1.clientY + t2.clientY) / 2 - center.y;
          const ratio = nextScale / gestureState.startScale;
          const next = clampPan(
            curFx - (gestureState.startFx - gestureState.startPanX) * ratio,
            curFy - (gestureState.startFy - gestureState.startPanY) * ratio,
            nextScale,
          );
          scale = nextScale;
          panX = next.x;
          panY = next.y;
          updateTransform();
        } else if (
          gestureState.mode === "pan" &&
          event.touches?.length === 1
        ) {
          const t = event.touches[0];
          gestureState.lastX = t.clientX;
          gestureState.lastY = t.clientY;
          const dx = t.clientX - gestureState.startX;
          const dy = t.clientY - gestureState.startY;
          if (Math.hypot(dx, dy) > 6) gestureState.moved = true;
          if (scale > 1.01) {
            if (event.cancelable) event.preventDefault();
            const next = clampPan(
              gestureState.startPanX + dx,
              gestureState.startPanY + dy,
              scale,
            );
            panX = next.x;
            panY = next.y;
            updateTransform();
          }
        }
      },
      { passive: false },
    );

    stage.addEventListener?.(
      "touchend",
      (event) => {
        if (event.touches?.length === 1 && gestureState?.mode === "pinch") {
          const remaining = event.touches[0];
          gestureState = {
            lastX: remaining.clientX,
            lastY: remaining.clientY,
            mode: "pan",
            moved: true,
            onPin: true,
            startPanX: panX,
            startPanY: panY,
            startX: remaining.clientX,
            startY: remaining.clientY,
          };
          return;
        }
        if (gestureState?.mode === "pan" && !event.touches?.length) {
          const endTouch = event.changedTouches?.[0];
          const tapX = Number.isFinite(endTouch?.clientX)
            ? endTouch.clientX
            : gestureState.lastX;
          const tapY = Number.isFinite(endTouch?.clientY)
            ? endTouch.clientY
            : gestureState.lastY;
          if (!gestureState.moved && !gestureState.onPin) {
            const now = Date.now();
            if (
              lastTap &&
              now - lastTap.at < 280 &&
              Math.hypot(tapX - lastTap.x, tapY - lastTap.y) < 28
            ) {
              setZoom(scale > 1.2 ? 1 : 2.4, tapX, tapY);
              lastTap = null;
            } else {
              lastTap = { at: now, x: tapX, y: tapY };
            }
          } else if (scale <= 1.01 && !gestureState.onPin) {
            const dx = tapX - gestureState.startX;
            const dy = tapY - gestureState.startY;
            if (dy >= 80 && Math.abs(dy) > Math.abs(dx) * 1.5) {
              gestureState = null;
              closeImageViewer();
              return;
            }
          }
        }
        if (!event.touches?.length) {
          gestureState = null;
        }
      },
      { passive: true },
    );

    stage.addEventListener?.(
      "wheel",
      (event) => {
        if (event.cancelable) event.preventDefault();
        const factor = event.deltaY < 0 ? 1.18 : 0.85;
        setZoom(scale * factor, event.clientX, event.clientY);
      },
      { passive: false },
    );

    activeImageViewer = {
      cleanup() {
        resizeObserver?.disconnect();
        viewerImg.removeEventListener?.("load", syncRegions);
        globalThis.removeEventListener?.("resize", syncRegions);
      },
      dialog,
      img,
      setZoom,
      stepRegion,
      syncActiveRegion,
    };

    syncActiveRegion(state?.activeRegion || "1");

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    syncRegions();
    return dialog;
  }
