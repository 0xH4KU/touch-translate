  // Touch gestures

  let swipe = null;
  let fourFinger = null;



  function hasNestedTextBlock(element) {
    const descendants = Array.from(element.children || []);
    while (descendants.length) {
      const child = descendants.pop();
      if (child.matches(NON_TEXT_SELECTOR)) continue;
      const style = getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (sourceText(child).length < 2) continue;
      if (
        child.matches(BLOCK_SELECTOR) ||
        (style.display !== "contents" && !style.display.startsWith("inline"))
      ) {
        return true;
      }
      descendants.push(...Array.from(child.children || []));
    }
    return false;
  }

  function swipeElementFor(target) {
    const translation = target?.closest?.(`.${TRANSLATION_CLASS}`);
    if (translation) return translation;
    const comment = target?.closest?.(YOUTUBE_COMMENT_SELECTOR);
    if (comment) return comment;

    let inline = null;
    for (
      let element = target;
      element;
      element = element.parentElement || element.getRootNode?.().host
    ) {
      if (element === document.body || element === document.documentElement) break;
      inline ||= element;
      const display = getComputedStyle(element).display;
      if (element.matches?.(TITLE_BLOCK_SELECTOR)) return element;
      if (
        element.matches?.(BLOCK_SELECTOR) ||
        (display !== "contents" && !display.startsWith("inline"))
      ) {
        return hasNestedTextBlock(element) ? null : element;
      }
    }
    return inline && !hasNestedTextBlock(inline) ? inline : null;
  }

  function isPageLevelContainer(element) {
    if (
      !element ||
      element === document.documentElement ||
      element === document.body
    ) {
      return true;
    }
    if (element.matches?.(PAGE_CONTAINER_SELECTOR)) return true;
    const main = document.querySelector?.("main, [role='main']");
    if (
      main &&
      typeof element.contains === "function" &&
      element.contains(main)
    ) {
      return true;
    }
    return false;
  }

  function canConsumeRightSwipe(target) {
    for (
      let element = target;
      element;
      element = element.parentElement || element.getRootNode?.().host
    ) {
      const style = getComputedStyle(element);
      if (
        element !== document.body &&
        element !== document.documentElement &&
        element !== document.scrollingElement &&
        element.scrollWidth > element.clientWidth + 1 &&
        /^(?:auto|scroll|overlay)$/.test(style.overflowX) &&
        (style.direction === "rtl"
          ? element.scrollLeft < -1
          : element.scrollLeft > 1)
      ) {
        return true;
      }
      if (element === document.documentElement) break;
    }
    return false;
  }

  function isOverlayLink(element) {
    if (!element || element.tagName !== "A") return false;
    if (element.matches?.(OVERLAY_LINK_SELECTOR)) return true;
    const style = getComputedStyle(element);
    if (style.position !== "absolute" && style.position !== "fixed") return false;
    const parent = element.parentElement;
    if (parent && typeof parent.getBoundingClientRect === "function") {
      const pRect = parent.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      if (rect.width >= pRect.width * 0.9 && rect.height >= pRect.height * 0.9) {
        return true;
      }
    }
    return false;
  }

  function resolveTargetElement(target, touch) {
    if (!target) return null;
    if (
      isOverlayLink(target) &&
      typeof document.elementsFromPoint === "function" &&
      touch
    ) {
      const elements =
        document.elementsFromPoint(touch.clientX, touch.clientY) || [];
      const underlying = elements.find(
        (element) =>
          (typeof Element === "undefined" || element instanceof Element) &&
          element !== target &&
          !isOverlayLink(element) &&
          !isPageLevelContainer(element),
      );
      if (underlying) return underlying;
    }
    return target;
  }

  function movedTooFar(touches, starts) {
    return Array.from(touches).some((touch) => {
      const start = starts.get(touch.identifier);
      return (
        start &&
        Math.hypot(touch.clientX - start.x, touch.clientY - start.y) >
        FOUR_FINGER_MAX_MOVE
      );
    });
  }

  function restoreGestureIndicator(gesture) {
    if (indicatorFor(gesture?.element)?.dataset.state !== "gesture") return;
    if (pendingJobs.has(gesture.element)) {
      showIndicator(gesture.element, "loading");
    } else if (gesture.indicatorState) {
      showIndicator(gesture.element, gesture.indicatorState);
    } else {
      removeIndicator(gesture.element, "gesture");
    }
  }

  function clearSwipe() {
    restoreGestureIndicator(swipe);
    swipe = null;
  }

  function onTouchStart(event) {
    if (isSuiteUi(event.target) || event.composedPath?.().some(isSuiteUi)) {
      resetTouches();
      return;
    }
    if (event.touches.length === 4) {
      clearSwipe();
      fourFinger = {
        at: Date.now(),
        cancelled: false,
        starts: new Map(
          Array.from(event.touches, (touch) => [
            touch.identifier,
            { x: touch.clientX, y: touch.clientY },
          ]),
        ),
      };
      return;
    }
    if (event.touches.length !== 1) {
      clearSwipe();
      return;
    }
    const touch = event.touches[0];
    const rawTarget =
      event.composedPath?.().find((node) => node instanceof Element) ||
      (event.target instanceof Element ? event.target : null);
    const target = resolveTargetElement(rawTarget, touch);
    const control = target?.closest("input, textarea, select, button");
    const comment = target?.closest(YOUTUBE_COMMENT_SELECTOR);
    if (
      !target ||
      touch.clientX < SAFARI_EDGE_X ||
      target.isContentEditable ||
      (control && !(comment && control.contains(comment))) ||
      canConsumeRightSwipe(target)
    ) {
      clearSwipe();
      return;
    }
    const element = swipeElementFor(target);
    if (!element) {
      clearSwipe();
      return;
    }
    const root = element.getRootNode();
    if (root !== document) addStyles(root);
    const now = Date.now();
    const indicator = indicatorFor(element);
    swipe = {
      action: pendingJobs.has(element)
        ? "cancel"
        : element.classList.contains(TRANSLATION_CLASS) ||
          translationAfter(element)
          ? "remove"
          : indicator?.dataset.state === "error"
            ? "retry"
            : "translate",
      at: now,
      element,
      identifier: touch.identifier,
      indicatorState: indicator?.dataset.state || null,
      phase: "possible",
      ready: false,
      samples: [{ at: now, x: touch.clientX }],
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  function onTouchMove(event) {
    if (fourFinger) {
      if (movedTooFar(event.touches, fourFinger.starts))
        fourFinger.cancelled = true;
      return;
    }
    if (!swipe) return;
    const touch = pointFor(event.touches, swipe.identifier);
    if (!touch) return;
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (swipe.phase === "possible") {
      const intent = swipeIntent(dx, dy);
      if (intent === "horizontal") {
        swipe.phase = "horizontal";
      } else if (intent === "cancel") {
        clearSwipe();
        return;
      }
    }
    if (swipe.phase !== "horizontal") return;
    if (event.cancelable) event.preventDefault();
    const now = Date.now();
    const velocityX = recordSwipeSample(swipe, touch.clientX, now);
    swipe.ready = swipeShouldCommit(dx, velocityX, swipe.ready);
    showIndicator(
      swipe.element,
      "gesture",
      swipe.ready ? 1 : dx / SWIPE_MIN_X,
      swipe.action,
      swipe.ready,
    );
  }

  function onTouchEnd(event) {
    if (fourFinger) {
      if (movedTooFar(event.changedTouches, fourFinger.starts))
        fourFinger.cancelled = true;
      if (event.touches.length === 0) {
        const gesture = fourFinger;
        fourFinger = null;
        if (
          !gesture.cancelled &&
          Date.now() - gesture.at <= FOUR_FINGER_MAX_MS
        ) {
          if (event.cancelable) event.preventDefault();
          startPageTranslation();
        }
      }
      return;
    }
    if (!swipe || event.touches.length) return;
    const gesture = swipe;
    swipe = null;
    const touch = pointFor(event.changedTouches, gesture.identifier);
    if (!touch) {
      restoreGestureIndicator(gesture);
      return;
    }
    const dx = touch.clientX - gesture.x;
    const now = Date.now();
    const velocityX = recordSwipeSample(
      gesture,
      touch.clientX,
      now,
    );
    if (gesture.phase === "possible") {
      gesture.phase = swipeIntent(dx, touch.clientY - gesture.y);
    }
    if (
      gesture.phase === "horizontal" &&
      swipeShouldCommit(dx, velocityX, gesture.ready)
    ) {
      if (event.cancelable) event.preventDefault();
      handleSwipe(gesture.element);
    } else {
      restoreGestureIndicator(gesture);
    }
  }

  function resetTouches() {
    clearSwipe();
    fourFinger = null;
  }
