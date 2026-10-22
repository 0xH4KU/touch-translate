  function restoreImageGestureIndicator(gesture) {
    const img = gesture?.img;
    if (!img) return;
    const state = imageStates.get(img);
    if (state?.button?.dataset?.state !== "gesture") return;
    if (state.job) {
      setImageButtonState(img, "loading");
    } else if (state.result) {
      setImageButtonState(img, "done");
    } else if (gesture.buttonState && gesture.buttonState !== "gesture") {
      setImageButtonState(img, gesture.buttonState);
    } else {
      setImageButtonState(img, "idle");
    }
  }

  function clearSwipe() {
    restoreImageGestureIndicator(swipe);
    swipe = null;
  }

  function resetTouches() {
    clearSwipe();
    firstTouch = null;
  }

  function updateSwipeTouches(gesture, touchList) {
    let matched = 0;
    for (const slot of gesture.touches) {
      const touch = pointFor(touchList, slot.identifier);
      if (touch) {
        slot.x = touch.clientX;
        slot.y = touch.clientY;
        matched += 1;
      }
    }
    return matched;
  }

  function swipeMetrics(gesture) {
    const [a, b] = gesture.touches;
    const dxA = a.x - a.startX;
    const dxB = b.x - b.startX;
    const dyA = a.y - a.startY;
    const dyB = b.y - b.startY;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    return {
      dx: Math.min(dxA, dxB),
      dy: Math.abs(dyA) >= Math.abs(dyB) ? dyA : dyB,
      opposite: (dxA < -6 && dxB > 6) || (dxA > 6 && dxB < -6),
      pinchDelta: Math.abs(dist - gesture.startDist),
    };
  }

  function onGesture(event) {
    if (swipe && event.cancelable) event.preventDefault?.();
  }

  function onTouchStart(event) {
    if (isSuiteUi(event.target) || event.composedPath?.().some(isSuiteUi)) {
      resetTouches();
      return;
    }
    const count = event.touches?.length || 0;
    const now = Date.now();
    if (count === 1) {
      clearSwipe();
      const touch = event.touches[0];
      firstTouch = touch
        ? {
            at: now,
            identifier: touch.identifier,
            x: touch.clientX,
            y: touch.clientY,
          }
        : null;
      return;
    }
    if (count !== 2) {
      resetTouches();
      return;
    }
    const [touchA, touchB] = event.touches;
    if (
      !touchA ||
      !touchB ||
      touchA.clientX < SAFARI_EDGE_X ||
      touchB.clientX < SAFARI_EDGE_X
    ) {
      resetTouches();
      return;
    }
    if (firstTouch) {
      const prior =
        firstTouch.identifier === touchA.identifier
          ? touchA
          : firstTouch.identifier === touchB.identifier
            ? touchB
            : null;
      const stale =
        now - firstTouch.at > TWO_FINGER_JOIN_MS ||
        (prior &&
          Math.hypot(
            prior.clientX - firstTouch.x,
            prior.clientY - firstTouch.y,
          ) > SWIPE_INTENT_PX);
      firstTouch = null;
      if (stale) {
        clearSwipe();
        return;
      }
    }
    const rawTarget =
      event.composedPath?.().find((node) => node instanceof Element) ||
      (event.target && typeof event.target === "object" ? event.target : null);
    if (
      rawTarget?.closest?.(
        `.${IMAGE_VIEWER_CLASS}, .${ERROR_DIALOG_CLASS}, .${SETTINGS_DIALOG_CLASS}`,
      ) ||
      rawTarget?.isContentEditable
    ) {
      clearSwipe();
      return;
    }
    const targetA =
      touchA.target && typeof touchA.target === "object"
        ? touchA.target
        : rawTarget;
    const targetB =
      touchB.target && typeof touchB.target === "object"
        ? touchB.target
        : rawTarget;
    const imgA = resolveTargetImage(targetA, touchA);
    const imgB = resolveTargetImage(targetB, touchB);
    const img = imgA && imgA === imgB ? imgA : null;
    const control = rawTarget?.closest?.("input, textarea, select, button");
    if (
      !img ||
      (control &&
        !control.classList?.contains?.(IMAGE_BUTTON_CLASS) &&
        !control.contains?.(img))
    ) {
      clearSwipe();
      return;
    }
    const root = img.getRootNode?.();
    if (root && root !== document && typeof root.querySelector === "function") {
      addStyles(root);
    }
    const state = ensureImageOverlay(img);
    const currentState = state?.button?.dataset?.state || "idle";
    swipe = {
      action: state?.job
        ? "cancel"
        : state?.result
          ? "open"
          : currentState === "error"
            ? "retry"
            : "translate",
      at: now,
      buttonState: currentState,
      img,
      phase: "possible",
      ready: false,
      samples: [{ at: now, x: 0 }],
      startDist: Math.hypot(
        touchA.clientX - touchB.clientX,
        touchA.clientY - touchB.clientY,
      ),
      touches: [
        {
          identifier: touchA.identifier,
          startX: touchA.clientX,
          startY: touchA.clientY,
          x: touchA.clientX,
          y: touchA.clientY,
        },
        {
          identifier: touchB.identifier,
          startX: touchB.clientX,
          startY: touchB.clientY,
          x: touchB.clientX,
          y: touchB.clientY,
        },
      ],
    };
  }

  function onTouchMove(event) {
    if (!swipe) return;
    const matched = updateSwipeTouches(swipe, event.touches);
    if (!matched || (matched < 2 && swipe.phase !== "horizontal")) {
      clearSwipe();
      return;
    }
    const { dx, dy, opposite, pinchDelta } = swipeMetrics(swipe);
    if (swipe.phase === "possible") {
      if (opposite || pinchDelta > SWIPE_PINCH_MAX_PX) {
        clearSwipe();
        return;
      }
      const intent = swipeIntent(dx, dy);
      if (intent === "horizontal") {
        swipe.phase = "horizontal";
      } else if (intent === "cancel") {
        clearSwipe();
        return;
      }
    }
    if (event.cancelable) event.preventDefault?.();
    if (swipe.phase !== "horizontal") return;
    event.stopPropagation?.();
    const now = Date.now();
    const velocityX = recordSwipeSample(swipe, dx, now);
    swipe.ready = swipeShouldCommit(dx, velocityX, swipe.ready);
    setImageButtonState(
      swipe.img,
      "gesture",
      swipe.ready ? 1 : dx / SWIPE_MIN_X,
      swipe.action,
      swipe.ready,
    );
    syncImageOverlay(swipe.img);
  }

  function onTouchEnd(event) {
    if (!event.touches?.length) firstTouch = null;
    if (!swipe) return;
    updateSwipeTouches(swipe, event.touches);
    updateSwipeTouches(swipe, event.changedTouches);
    const { dx, dy, pinchDelta } = swipeMetrics(swipe);
    const now = Date.now();
    const velocityX = recordSwipeSample(swipe, dx, now);
    if (swipe.phase === "possible" && pinchDelta <= SWIPE_PINCH_MAX_PX) {
      swipe.phase = swipeIntent(dx, dy);
    }
    if (event.touches?.length) {
      if (swipe.phase !== "horizontal") {
        clearSwipe();
      } else {
        swipe.ready = swipeShouldCommit(dx, velocityX, swipe.ready);
      }
      return;
    }
    const gesture = swipe;
    swipe = null;
    if (
      gesture.phase === "horizontal" &&
      swipeShouldCommit(dx, velocityX, gesture.ready)
    ) {
      if (event.cancelable) event.preventDefault?.();
      event.stopPropagation?.();
      lastSwipeCommitAt = now;
      handleImageSwipe(gesture.img);
    } else {
      restoreImageGestureIndicator(gesture);
    }
  }

  let imageScanTimer;

  function scanPageImages() {
    imageScanTimer = undefined;
    for (const img of [...trackedImages]) {
      syncImageOverlay(img);
    }
  }

  function scheduleImageScan() {
    if (imageScanTimer) return;
    imageScanTimer = setTimeout(scanPageImages, 120);
  }

  function initImageTranslation() {
    const touchTarget =
      typeof globalThis.addEventListener === "function" ? globalThis : document;
    touchTarget.addEventListener?.("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    touchTarget.addEventListener?.("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });
    touchTarget.addEventListener?.("touchend", onTouchEnd, {
      capture: true,
      passive: false,
    });
    touchTarget.addEventListener?.("touchcancel", resetTouches, {
      capture: true,
      passive: true,
    });
    touchTarget.addEventListener?.("gesturestart", onGesture, {
      capture: true,
      passive: false,
    });
    touchTarget.addEventListener?.("gesturechange", onGesture, {
      capture: true,
      passive: false,
    });
    document.addEventListener?.(
      "click",
      (event) => {
        if (
          lastSwipeCommitAt &&
          Date.now() - lastSwipeCommitAt < 400 &&
          !event.target?.closest?.(
            `.${IMAGE_VIEWER_CLASS}, .${ERROR_DIALOG_CLASS}, .${SETTINGS_DIALOG_CLASS}, .${TOAST_CLASS}`,
          )
        ) {
          lastSwipeCommitAt = 0;
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
        }
      },
      true,
    );
    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver((records) => {
        if (
          trackedImages.size &&
          records.some(
            (record) =>
              !record.target.closest?.(
                `.${IMAGE_OVERLAY_CLASS}, .${IMAGE_VIEWER_CLASS}`,
              ),
          )
        ) {
          scheduleImageScan();
        }
      });
      observer.observe(document.body || document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "hidden", "src", "srcset", "style"],
        childList: true,
        subtree: true,
      });
    }
    document.addEventListener?.(
      "load",
      (event) => {
        if (event.target?.tagName === "IMG" && imageStates.has(event.target)) {
          syncImageOverlay(event.target);
        }
      },
      true,
    );
    globalThis.addEventListener?.("resize", scheduleImageScan, {
      passive: true,
    });
    globalThis.addEventListener?.("scroll", scheduleImageScan, {
      capture: true,
      passive: true,
    });
  }
