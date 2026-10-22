  function canRetryTranslation(element) {
    return element.tagName === "IMG";
  }

  function retryTranslations(elements) {
    elements.forEach((img) => translateImage(img).catch(reportError));
  }

  // Test interface

  if (globalThis.__TOUCH_IMAGE_TRANSLATE_TEST__) {
    Object.assign(globalThis.__TOUCH_IMAGE_TRANSLATE_TEST__, {
      cancelImageJob,
      cleanSettings,
      configureSettings,
      generationConfigFor,
      loadCache,
      saveCache,
      readySettings,
      closeImageViewer,
      computeRegionBoxLayout,
      endpointFor,
      ensureImageOverlay,
      errorMessageFor,
      extractNormalizedImage,
      handleImageButtonClick,
      handleImageSwipe,
      hashImageCacheKey,
      imageAnchor,
      imageContentBox,
      isPrivateOrLocalHost,
      isTranslatableImage,
      mergeDenseImageRegions,
      normalizeImageRegion,
      normalizeText,
      onGesture,
      onTouchEnd,
      onTouchMove,
      onTouchStart,
      openImageViewer,
      parseImageTranslation,
      parseImportedSettings,
      parseRegionTranslation,
      pointFor,
      projectedSwipeX,
      removeImageTranslation,
      requestImageTranslation,
      resetTouches,
      resolveTargetImage,
      retryDelayFor,
      setActiveImageRegion,
      structuredOutputUnsupported,
      swipeIntent,
      swipeShouldCommit,
      swipeVelocity,
      syncImageOverlay,
      translateImage,
    });
    return;
  }


  // Initialization

  addStyles();
  initImageTranslation();

  registerCommonMenus();
