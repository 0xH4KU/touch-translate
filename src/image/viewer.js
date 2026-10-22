  function storeImageResult(img, result) {
    if (!img?.isConnected) return null;
    const translation =
      typeof result === "string" ? result : result?.translation;
    if (!normalizeText(translation)) return null;
    const regions = Array.isArray(result?.regions) ? result.regions : [];
    const normalizedResult = {
      hasText: true,
      regions,
      translation,
    };

    const state = ensureImageOverlay(img);
    if (state) {
      state.regions = regions;
      state.result = normalizedResult;
      state.activeRegion = regions.length ? "1" : "";
      setImageButtonState(img, "done");
    }

    return normalizedResult;
  }

  function openImageViewer(img, result) {
    const normalized = storeImageResult(img, result);
    if (!normalized) return null;
    const { translation, regions } = normalized;
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
    counter.textContent = regions.length
      ? `Region 1 / ${regions.length}`
      : "Image translation";

    const barActions = document.createElement("div");

    const togglePinsBtn = document.createElement("button");
    togglePinsBtn.type = "button";
    togglePinsBtn.dataset.action = "toggle-pins";
    togglePinsBtn.textContent = "Hide pins";
    if (!regions.length) togglePinsBtn.hidden = true;

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

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.dataset.action = "toggle-expand";
    expandBtn.textContent = `All (${regions.length})`;

    if (regions.length <= 1) {
      sheetHeader.hidden = true;
    }
    sheetHeader.append(navGroup, expandBtn);

    const activeCard = document.createElement("div");
    activeCard.className = IMAGE_VIEWER_ACTIVE_CLASS;
    const activeBadge = document.createElement("span");
    activeBadge.className = IMAGE_BADGE_CLASS;
    const activeText = document.createElement("div");
    activeText.className = IMAGE_TEXT_CLASS;
    if (regions.length) {
      activeCard.append(activeBadge, activeText);
    } else {
      assembleTranslatedContent(activeText, translation);
      activeCard.append(activeText);
    }

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
      const textSpan = document.createElement("span");
      textSpan.className = IMAGE_TEXT_CLASS;
      assembleTranslatedContent(textSpan, region.translation || "");
      item.append(badge, textSpan);
      item.addEventListener?.("click", (event) => {
        event.stopPropagation?.();
        setActiveImageRegion(img, label, { toggle: true });
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

    const setZoom = (nextScale, focalX = 0, focalY = 0) => {
      const clamped = clampNumber(nextScale, 1, 5);
      if (clamped <= 1.01) {
        scale = 1;
        panX = 0;
        panY = 0;
      } else {
        const ratio = clamped / scale;
        panX = focalX - (focalX - panX) * ratio;
        panY = focalY - (focalY - panY) * ratio;
        scale = clamped;
      }
      updateTransform();
    };

    const syncActiveRegion = (activeLabel) => {
      const label = String(activeLabel || "");
      applySpotlightToSvg(svg, label);
      for (const item of listItems) {
        const itemRegion =
          item.dataset?.region || item.getAttribute?.("data-region");
        if (label && itemRegion === label) {
          item.setAttribute?.("data-active", "true");
        } else {
          item.removeAttribute?.("data-active");
        }
      }
      if (!regions.length) return;
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
      assembleTranslatedContent(activeText, shownRegion?.translation || "");
    };

    const stepRegion = (delta) => {
      if (!regions.length) return;
      const currentNum = Number(state?.activeRegion) || 1;
      const nextNum =
        ((currentNum - 1 + delta + regions.length) % regions.length) + 1;
      setActiveImageRegion(img, String(nextNum), { toggle: false });
    };

    prevBtn.addEventListener?.("click", () => stepRegion(-1));
    nextBtn.addEventListener?.("click", () => stepRegion(1));

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

    // Touch pinch-to-zoom, 1-finger pan, and double-tap zoom on stage
    let gestureState = null;
    let lastTapAt = 0;

    stage.addEventListener?.(
      "touchstart",
      (event) => {
        if (event.touches?.length === 2) {
          const [t1, t2] = event.touches;
          const dist = Math.hypot(
            t2.clientX - t1.clientX,
            t2.clientY - t1.clientY,
          );
          gestureState = {
            mode: "pinch",
            startDist: Math.max(10, dist),
            startPanX: panX,
            startPanY: panY,
            startScale: scale,
            midX: (t1.clientX + t2.clientX) / 2,
            midY: (t1.clientY + t2.clientY) / 2,
          };
        } else if (event.touches?.length === 1) {
          const t = event.touches[0];
          gestureState = {
            mode: "pan",
            moved: false,
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
          const midX = (t1.clientX + t2.clientX) / 2;
          const midY = (t1.clientY + t2.clientY) / 2;
          scale = nextScale;
          panX = gestureState.startPanX + (midX - gestureState.midX);
          panY = gestureState.startPanY + (midY - gestureState.midY);
          updateTransform();
        } else if (
          gestureState.mode === "pan" &&
          event.touches?.length === 1
        ) {
          const t = event.touches[0];
          const dx = t.clientX - gestureState.startX;
          const dy = t.clientY - gestureState.startY;
          if (Math.hypot(dx, dy) > 6) gestureState.moved = true;
          if (scale > 1.01) {
            if (event.cancelable) event.preventDefault();
            panX = gestureState.startPanX + dx;
            panY = gestureState.startPanY + dy;
            updateTransform();
          }
        }
      },
      { passive: false },
    );

    stage.addEventListener?.(
      "touchend",
      (event) => {
        if (
          gestureState?.mode === "pan" &&
          !gestureState.moved &&
          event.touches?.length === 0
        ) {
          const now = Date.now();
          if (now - lastTapAt < 280) {
            setZoom(scale > 1.2 ? 1 : 2.4);
            lastTapAt = 0;
          } else {
            lastTapAt = now;
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
        setZoom(scale * factor);
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

    syncActiveRegion(state?.activeRegion || (regions.length ? "1" : ""));

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    syncRegions();
    return dialog;
  }
