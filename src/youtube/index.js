  // Test interface
  if (globalThis.__TOUCH_YOUTUBE_TRANSLATE_TEST__) {
    Object.assign(globalThis.__TOUCH_YOUTUBE_TRANSLATE_TEST__, {
      parseYoutubeCaptions, ruleSubtitleGroups, subtitleGroupsFromRanges, makeSubtitleChunks, mergeBilingualCaptions,
      parseSubtitleGroups, requestSubtitleTranslation, subtitleCacheKey, joinCaptionText,
      youtubeVideoId, selectYoutubeTrack, selectTargetYoutubeTrack, sameLanguage, youtubeCaptionUrl, youtubeTrackKey,
      captionBridgeRequest, youtubeCaptionBridge, installCaptionBridge,
      subtitleAtTime, subtitleQueueChunk, cancelSubtitleRequest,
      pumpSubtitleQueue, loadYoutubeCaptions, loadSubtitlePreferences,
      startYoutubeSubtitles, stopYoutubeSubtitles, retryYoutubeSubtitles, resegmentYoutubeSubtitles, checkSubtitleTrack,
      mountSubtitleView, renderSubtitles, refreshYoutubePlayer,
      cleanSettings, parseImportedSettings, endpointFor, loadCache, saveCache,
      getSession: () => subtitleSession, getView: () => subtitleView,
      setSession: (session) => { subtitleSession = session; },
    });
    return;
  }

  function refreshYoutubePlayer() {
    const videoId = youtubeVideoId();
    const video = videoId
      ? document.querySelector("#movie_player video") ||
        document.querySelector("video.html5-main-video") ||
        document.querySelector("video")
      : null;
    const player = video?.closest("#movie_player, .html5-video-player") || video?.parentElement;
    if (subtitleView && (!videoId || subtitleView.video !== video || !subtitleView.host.isConnected ||
      subtitleView.videoId !== videoId)) {
      stopYoutubeSubtitles();
      subtitleView.cleanup();
      if (subtitleView.player.style.position === "relative") subtitleView.player.style.position = subtitleView.position;
      subtitleView.trigger?.remove();
      subtitleView.host.remove();
      subtitleView = null;
    }
    if (player && video && !subtitleView) {
      mountSubtitleView(player, video);
      subtitleView.videoId = videoId;
      if (subtitleView.preferences.enabled) void startYoutubeSubtitles(true);
    }
    if (subtitleView) {
      syncSubtitleTriggerDock(subtitleView);
      updateSubtitlePosition(subtitleView);
    }
    const session = subtitleSession;
    if (session) {
      if (JSON.stringify(session.settings) !== JSON.stringify(loadSettings())) {
        stopYoutubeSubtitles("API settings changed. Enable captions again.");
        return;
      }
      renderSubtitles(session);
      void pumpSubtitleQueue(session);
      void checkSubtitleTrack(session);
    }
  }

  installCaptionBridge();
  function initializeYoutubeSubtitles() {
    installCaptionBridge();
    addStyles();
    registerCommonMenus();
    GM_registerMenuCommand(`${SCRIPT_NAME}: Toggle captions`, toggleYoutubeSubtitles);
    refreshYoutubePlayer();
    setInterval(refreshYoutubePlayer, 1000);
    document.addEventListener("yt-navigate-start", () => stopYoutubeSubtitles());
    document.addEventListener("yt-navigate-finish", refreshYoutubePlayer);
    window.addEventListener("pagehide", () => stopYoutubeSubtitles());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeYoutubeSubtitles, { once: true });
  else initializeYoutubeSubtitles();
