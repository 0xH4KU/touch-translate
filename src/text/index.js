  function canRetryTranslation(element) {
    return !translationAfter(element);
  }

  function retryTranslations(elements) {
    translateElements(elements).catch(reportError);
  }

  // Test interface

  if (globalThis.__TOUCH_TRANSLATE_TEST__) {
    Object.assign(globalThis.__TOUCH_TRANSLATE_TEST__, {
      cleanSettings,
      configureSettings,
      generationConfigFor,
      loadCache,
      saveCache,
      parseImportedSettings,
      readySettings,
      translateElements,
      cancelJob,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      resetTouches,
      compareViewportPriority,
      endpointFor,
      errorMessageFor,
      groupRecords,
      hashCacheKey,
      canConsumeRightSwipe,
      indicatorFor,
      insertTranslation,
      isChineseText,
      isPrivateOrLocalHost,
      isRenderedTextNode,
      isSafeHref,
      isTranslatablePageBlock,
      shouldSplitBatch,
      thinkingUnsupported,
      makeBatches,
      movedTooFar,
      normalizeText,
      oversizedBlocksError,
      pageTextLooksUseful,
      parseInlineTranslation,
      parseTranslations,
      pointFor,
      projectedSwipeX,
      recordMatchesElement,
      requestTranslations,
      resolveTargetElement,
      retryDelayFor,
      sourceText,
      translationAfter,
      translationRequestFor,
      structuredOutputUnsupported,
      swipeIntent,
      swipeShouldCommit,
      swipeVelocity,
      swipeElementFor,
      undoPageTranslations,
      viewportPriority,
    });
    return;
  }


  // Initialization

  addStyles();
  document.addEventListener("touchstart", onTouchStart, {
    capture: true,
    passive: true,
  });
  document.addEventListener("touchmove", onTouchMove, {
    capture: true,
    passive: false,
  });
  document.addEventListener("touchend", onTouchEnd, {
    capture: true,
    passive: false,
  });
  document.addEventListener("touchcancel", resetTouches, {
    capture: true,
    passive: true,
  });
  document.addEventListener(
    "click",
    (event) => {
      if (
        lastSwipeCommitAt &&
        Date.now() - lastSwipeCommitAt < 400 &&
        !isSuiteUi(event.target)
      ) {
        lastSwipeCommitAt = 0;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }
    },
    true,
  );

  registerCommonMenus();
  GM_registerMenuCommand("Touch Translate: Auto-translate page", startPageTranslation);
