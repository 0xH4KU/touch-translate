  const pendingJobs = new WeakMap();
  const swipeBatch = new Map();
  let swipeBatchTimer;

  function restoreAriaBusy(job) {
    if (job.ariaBusy === null) job.element.removeAttribute("aria-busy");
    else job.element.setAttribute("aria-busy", job.ariaBusy);
  }

  function trackJob(job, task) {
    job.task = task;
    task.jobs.add(job);
  }

  function detachJob(job, abortWhenUnused = false) {
    job.task?.jobs.delete(job);
    job.task = undefined;
    const request = job.request;
    job.request = undefined;
    if (!request) return;
    request.jobs.delete(job);
    if (abortWhenUnused && !request.jobs.size) request.abort();
  }

  function beginJob(element, committed = false) {
    const existing = pendingJobs.get(element);
    if (existing) return existing;
    const job = {
      ariaBusy: element.getAttribute("aria-busy"),
      cancelled: false,
      element,
      indicatorTimer: undefined,
      request: undefined,
      task: undefined,
    };
    pendingJobs.set(element, job);
    element.setAttribute("aria-busy", "true");
    if (committed) {
      showIndicator(element, "committed");
      job.indicatorTimer = setTimeout(() => {
        if (pendingJobs.get(element) === job) showIndicator(element, "loading");
      }, COMMIT_HOLD_MS);
    } else {
      showIndicator(element, "loading");
    }
    return job;
  }

  function settleJob(job, state = "done") {
    if (pendingJobs.get(job.element) !== job) return;
    clearTimeout(job.indicatorTimer);
    pendingJobs.delete(job.element);
    detachJob(job);
    restoreAriaBusy(job);
    if (state === "error") {
      showIndicator(job.element, "error");
    } else {
      removeIndicator(job.element);
    }
  }

  function cancelJob(element) {
    const job = pendingJobs.get(element);
    if (!job) return false;
    job.cancelled = true;
    clearTimeout(job.indicatorTimer);
    pendingJobs.delete(element);
    swipeBatch.delete(element);
    detachJob(job, true);
    restoreAriaBusy(job);
    removeIndicator(element);
    if (!swipeBatch.size && swipeBatchTimer) {
      clearTimeout(swipeBatchTimer);
      swipeBatchTimer = undefined;
    }
    return true;
  }

  async function translateElements(
    elements,
    { claimedJobs = new Map(), showProgress = false, task } = {},
  ) {
    const currentTask = task || { cancelled: false, jobs: new Set() };
    claimedJobs.forEach((job) => trackJob(job, currentTask));
    const settings = await readySettings();
    if (!settings) {
      [...currentTask.jobs].forEach((job) => settleJob(job));
      return;
    }

    let cache = loadCache();
    const records = [];
    const oversized = [];
    let completed = 0;
    for (const element of elements) {
      const claimedJob = claimedJobs.get(element);
      if (!element?.isConnected || translationAfter(element)) {
        if (claimedJob) settleJob(claimedJob);
        continue;
      }
      const currentJob = pendingJobs.get(element);
      if (currentJob && currentJob !== claimedJob) continue;
      const text = sourceText(element);
      if (text.length < 2) {
        if (claimedJob) settleJob(claimedJob);
        continue;
      }
      const key = hashCacheKey(text, settings);
      const { requestText, segmentCount } = translationRequestFor(
        element,
        text,
      );
      const formatKey = hashCacheKey(requestText, settings);
      const cached = cache[key];
      if (
        typeof cached?.translation === "string" &&
        cached.translation &&
        (!segmentCount || cached.formatKey === formatKey)
      ) {
        insertTranslation(
          element,
          {
            translation: cached.translation,
            segments:
              cached.formatKey === formatKey && Array.isArray(cached.segments)
                ? cached.segments
                : null,
          },
          currentTask.translations,
        );
        if (claimedJob) settleJob(claimedJob);
        completed += 1;
      } else if (requestText.length > BATCH_MAX_CHARS) {
        // ponytail: reject oversized blocks; add sentence chunking only when
        // real pages justify the marker and cancellation complexity.
        const job = claimedJob || beginJob(element);
        if (!claimedJob) trackJob(job, currentTask);
        settleJob(job, "error");
        oversized.push(requestText.length);
      } else {
        records.push({
          element,
          formatKey,
          job: claimedJob,
          key,
          requestText,
          segmentCount,
          text,
        });
      }
    }

    const total = completed + records.length;
    if (!total) {
      if (oversized.length) throw oversizedBlocksError(oversized);
      if (showProgress) toast("No new translatable blocks found");
      return;
    }
    let activeTotal = total;
    if (showProgress) {
      toast(`Translating ${completed}/${activeTotal}`, 0);
    }

    const batches = makeBatches(groupRecords(records), showProgress);
    const failedJobs = [];
    let responseError;
    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        if (currentTask.cancelled) return;
        const activeBatch = [];
        for (const group of batch) {
          const entries = [];
          for (const record of group.entries) {
            const { element } = record;
            let { job } = record;
            if (!element.isConnected) {
              if (job) settleJob(job);
              activeTotal -= 1;
              continue;
            }
            if (translationAfter(element)) {
              if (job) settleJob(job);
              completed += 1;
              continue;
            }
            if (!recordMatchesElement(record, settings)) {
              if (job) settleJob(job);
              activeTotal -= 1;
              continue;
            }
            const currentJob = pendingJobs.get(element);
            if (job) {
              if (currentJob !== job) {
                activeTotal -= 1;
                continue;
              }
            } else {
              if (currentJob) {
                activeTotal -= 1;
                continue;
              }
              job = beginJob(element);
              trackJob(job, currentTask);
            }
            entries.push({ ...record, job });
          }
          if (entries.length) activeBatch.push({ ...group, entries });
        }
        if (!activeBatch.length) continue;

        const request = requestTranslations(
          activeBatch.map((group) => group.requestText || group.text),
          settings,
        );
        const activeRequest = { abort: request.abort, jobs: new Set() };
        activeBatch.forEach((group) =>
          group.entries.forEach(({ job }) => {
            job.request = activeRequest;
            activeRequest.jobs.add(job);
          }),
        );
        let translations;
        try {
          translations = await request.promise;
        } catch (error) {
          if (currentTask.cancelled) return;
          if (error?.name === "AbortError") {
            activeBatch.forEach((group) =>
              group.entries.forEach(({ job }) => {
                settleJob(job);
                activeTotal -= 1;
              }),
            );
            continue;
          }
          if (!shouldSplitBatch(error)) throw error;
          if (activeBatch.length > 1) {
            batches.splice(
              batchIndex + 1, 0, ...activeBatch.map((group) => [group]),
            );
          } else {
            responseError ||= error;
            activeBatch[0].entries.forEach(({ job }) => {
              if (pendingJobs.get(job.element) !== job || job.cancelled) return;
              failedJobs.push(job);
              settleJob(job, "error");
              activeTotal -= 1;
            });
          }
          continue;
        } finally {
          activeRequest.jobs.forEach((job) => {
            if (job.request === activeRequest) job.request = undefined;
          });
          activeRequest.jobs.clear();
        }
        if (currentTask.cancelled) return;
        const cacheEntries = {};
        translations.forEach((rawTranslation, index) => {
          const group = activeBatch[index];
          const result = parseInlineTranslation(
            rawTranslation,
            group.segmentCount,
          );
          if (result.translation !== group.text) {
            cacheEntries[group.key] = {
              ...result,
              formatKey: group.formatKey,
              at: Date.now(),
            };
          }
          for (const record of group.entries) {
            const { element, formatKey, job } = record;
            if (pendingJobs.get(element) !== job || job.cancelled) {
              activeTotal -= 1;
              continue;
            }
            if (!recordMatchesElement(record, settings)) {
              settleJob(job);
              activeTotal -= 1;
              continue;
            }
            insertTranslation(
              element,
              {
                translation: result.translation,
                segments:
                  formatKey === group.formatKey ? result.segments : null,
              },
              currentTask.translations,
            );
            settleJob(job);
            completed += 1;
          }
        });
        if (Object.keys(cacheEntries).length) {
          cache = saveCache(cacheEntries);
        }
        if (showProgress) {
          toast(`Translating ${completed}/${activeTotal}`, 0);
        }
      }
      if (responseError && !currentTask.autoPage) throw responseError;
    } catch (error) {
      if (error?.name === "AbortError") {
        [...currentTask.jobs].forEach((job) => settleJob(job));
        return;
      }
      const remainingJobs = [...currentTask.jobs];
      const failedElements = [...failedJobs, ...remainingJobs]
        .filter((job) => !pendingJobs.has(job.element) || pendingJobs.get(job.element) === job)
        .map((job) => job.element)
        .filter((element) => element?.isConnected && !translationAfter(element));
      remainingJobs.forEach((job) => settleJob(job, "error"));
      const failure =
        error instanceof Error ? error : new Error(errorMessageFor(error));
      failure.retryElements = failedElements;
      throw failure;
    }
    if (oversized.length && !currentTask.autoPage) throw oversizedBlocksError(oversized);
    if (showProgress && !currentTask.cancelled) {
      toast(`Translated ${completed} blocks`);
    }
  }


  function flushSwipeBatch() {
    swipeBatchTimer = undefined;
    const claimedJobs = new Map(
      [...swipeBatch].filter(
        ([element, job]) => pendingJobs.get(element) === job,
      ),
    );
    swipeBatch.clear();
    if (!claimedJobs.size) return;
    translateElements([...claimedJobs.keys()], { claimedJobs }).catch(
      reportError,
    );
  }

  function scheduleTranslation(element) {
    const job = beginJob(element, true);
    swipeBatch.set(element, job);
    clearTimeout(swipeBatchTimer);
    swipeBatchTimer = setTimeout(flushSwipeBatch, SWIPE_BATCH_MS);
  }

  function handleSwipe(element) {
    if (!element?.isConnected) return;
    if (element.classList.contains(TRANSLATION_CLASS)) {
      removeTranslation(element);
      return;
    }
    if (cancelJob(element)) return;
    const existing = translationAfter(element);
    if (existing) {
      removeTranslation(existing);
      removeIndicator(element);
      return;
    }
    scheduleTranslation(element);
  }

  let pageTask;
  function undoPageTranslations(task) {
    task.translations.forEach(removeTranslation);
    task.translations.clear();
  }

  function observePageBlocks(task) {
    if (!task.intersectionObserver) return 0;
    const roots = pageContentRoots();
    const elements = document.querySelectorAll(BLOCK_SELECTOR);
    let count = 0;
    for (const element of elements) {
      if (
        !task.observedBlocks.has(element) &&
        isTranslatablePageBlock(element, roots)
      ) {
        task.observedBlocks.add(element);
        task.intersectionObserver.observe(element);
        count += 1;
      }
    }
    return count;
  }

  function stopPageTranslation(
    task,
    message = "",
    removeTranslations = false,
  ) {
    if (pageTask === task) pageTask = undefined;
    task.cancelled = true;
    clearTimeout(task.refreshTimer);
    clearTimeout(task.scheduleTimer);
    task.observer?.disconnect();
    task.intersectionObserver?.disconnect();
    globalThis.removeEventListener("scroll", task.refresh, true);
    [...task.jobs].forEach((job) => cancelJob(job.element));
    if (removeTranslations) undoPageTranslations(task);
    if (message) toast(message);
  }

  function runPageTranslation(task, showProgress = false) {
    if (task.cancelled) return;
    if (task.running) {
      task.rerun = true;
      return;
    }
    let blocks;
    if (task.intersectionObserver) {
      const roots = pageContentRoots();
      const viewportHeight =
        innerHeight || document.documentElement.clientHeight;
      blocks = [...task.pendingBlocks]
        .filter((element) => {
          const eligible = isTranslatablePageBlock(element, roots);
          if (!eligible) task.observedBlocks.delete(element);
          return eligible;
        })
        .map((element) => ({
          element,
          rect: element.getBoundingClientRect(),
        }))
        .sort((a, b) =>
          compareViewportPriority(a.rect, b.rect, viewportHeight),
        )
        .map(({ element }) => element);
      task.pendingBlocks.clear();
      if (!blocks.length) return;
    } else {
      blocks = collectPageBlocks(true);
    }
    task.running = translateElements(blocks, {
      showProgress,
      task,
    })
      .catch((error) => {
        if (task.cancelled) return;
        stopPageTranslation(task);
        reportError(error);
      })
      .finally(() => {
        task.running = null;
        if (task.rerun && !task.cancelled) {
          task.rerun = false;
          runPageTranslation(task);
        }
      });
  }

  async function startPageTranslation() {
    if (pageTask) {
      stopPageTranslation(
        pageTask,
        "Automatic page translation undone",
        true,
      );
      return;
    }
    if (!(await readySettings())) return;
    const task = {
      autoPage: true,
      cancelled: false,
      initialRun: true,
      jobs: new Set(),
      observedBlocks: new WeakSet(),
      pendingBlocks: new Set(),
      rerun: false,
      translations: new Set(),
    };
    task.schedule = () => {
      clearTimeout(task.scheduleTimer);
      task.scheduleTimer = setTimeout(() => {
        const isFirst = task.initialRun;
        task.initialRun = false;
        runPageTranslation(task, isFirst);
      }, 60);
    };
    task.refresh = () => {
      clearTimeout(task.refreshTimer);
      task.refreshTimer = setTimeout(() => {
        if (task.cancelled) return;
        if (task.intersectionObserver) {
          observePageBlocks(task);
        } else {
          runPageTranslation(task);
        }
      }, PAGE_REFRESH_MS);
    };
    task.observer = new MutationObserver(task.refresh);
    task.observer.observe(document.body || document.documentElement, {
      attributes: true,
      attributeFilter: [
        "aria-expanded",
        "aria-hidden",
        "aria-selected",
        "class",
        "data-state",
        "hidden",
        "open",
        "role",
        "style",
      ],
      childList: true,
      subtree: true,
    });
    if (typeof IntersectionObserver === "function") {
      task.intersectionObserver = new IntersectionObserver(
        (entries) => {
          let hasNew = false;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              task.pendingBlocks.add(entry.target);
              task.intersectionObserver.unobserve(entry.target);
              hasNew = true;
            }
          }
          if (hasNew && !task.cancelled) {
            task.schedule();
          }
        },
        { rootMargin: "100% 0px 100% 0px" },
      );
      const observed = observePageBlocks(task);
      if (!observed) toast("No new translatable blocks found");
    } else {
      globalThis.addEventListener("scroll", task.refresh, {
        capture: true,
        passive: true,
      });
      runPageTranslation(task, true);
    }
    pageTask = task;
  }
