  let imageViewerIntent = 0;

  function finishImageResult(img, result, intent) {
    if (intent === imageViewerIntent) return openImageViewer(img, result);
    storeImageResult(img, result);
    return null;
  }

  function cancelImageJob(img) {
    const state = imageStates.get(img);
    const job = state?.job;
    if (!job) return false;
    job.cancelled = true;
    state.job = null;
    restoreAriaBusy(job);
    job.abort?.();
    setImageButtonState(img, state?.result ? "done" : "idle");
    return true;
  }

  async function translateImage(img) {
    if (!img?.isConnected) return null;
    const state = ensureImageOverlay(img);
    if (!state || state.job) return null;
    if (state.result) {
      return openImageViewer(img, state.result);
    }
    const job = {
      abort: null,
      ariaBusy: img.getAttribute?.("aria-busy") ?? null,
      cancelled: false,
      element: img,
      viewerIntent: ++imageViewerIntent,
    };
    state.job = job;
    img.setAttribute?.("aria-busy", "true");
    setImageButtonState(img, "loading");

    try {
      const settings = await readySettings();
      syncImageOverlay(img);
      if (!settings || job.cancelled || state.job !== job) {
        if (state.job === job) {
          state.job = null;
          restoreAriaBusy(job);
          setImageButtonState(img, state.result ? "done" : "idle");
        }
        return null;
      }

      const src = String(img.currentSrc || img.src || "").trim();
      const cache = loadCache();
      const cacheKey = src ? hashImageCacheKey(src, settings) : "";
      const cached = cacheKey ? cache[cacheKey] : null;
      if (typeof cached?.translation === "string" && cached.translation) {
        state.job = null;
        restoreAriaBusy(job);
        return finishImageResult(img, cached, job.viewerIntent);
      }

      const imageData = await extractNormalizedImage(img, (abortFn) => {
        job.abort = abortFn;
      });
      syncImageOverlay(img);
      if (job.cancelled || state.job !== job) return null;

      const request = requestImageTranslation(imageData, settings);
      job.abort = request.abort;
      const result = await request.promise;
      syncImageOverlay(img);
      if (job.cancelled || state.job !== job) return null;

      state.job = null;
      restoreAriaBusy(job);

      if (!result.hasText || !normalizeText(result.translation)) {
        setImageButtonState(img, "idle");
        toast("No translatable text found in image");
        return null;
      }

      if (cacheKey) {
        saveCache({ [cacheKey]: {
          at: Date.now(),
          regions: result.regions,
          translation: result.translation,
        } });
      }
      return finishImageResult(img, result, job.viewerIntent);
    } catch (error) {
      if (job.cancelled || error?.name === "AbortError") {
        if (state.job === job) {
          state.job = null;
          restoreAriaBusy(job);
          setImageButtonState(img, state.result ? "done" : "idle");
        }
        return null;
      }
      if (state.job === job) {
        state.job = null;
        restoreAriaBusy(job);
        setImageButtonState(img, "error");
      }
      const failure =
        error instanceof Error ? error : new Error(errorMessageFor(error));
      failure.retryElements = img?.isConnected ? [img] : [];
      throw failure;
    }
  }

  function handleImageSwipe(img) {
    if (!img?.isConnected) return null;
    syncImageOverlay(img);
    if (cancelImageJob(img)) return null;
    const state = imageStates.get(img);
    if (state?.result) {
      return openImageViewer(img, state.result);
    }
    const promise = translateImage(img);
    promise.catch(reportError);
    return promise;
  }

  function handleImageButtonClick(img, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    handleImageSwipe(img);
  }
