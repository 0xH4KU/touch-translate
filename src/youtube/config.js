  const SCRIPT_NAME = "Touch YouTube Translate";
  const SCRIPT_PREFIX = "touch-youtube-translate";
  const CACHE_KEY = "youtube-cache-v1";
  const CACHE_LIMIT = 200;
  const PREFERENCES_KEY = "youtube-preferences-v1";
  const ERROR_DIALOG_CLASS = `${SCRIPT_PREFIX}__error`;
  const SETTINGS_DIALOG_CLASS = `${SCRIPT_PREFIX}__settings`;
  const TOAST_CLASS = `${SCRIPT_PREFIX}__toast`;
  const EXPECTED_FORMAT = '{"groups":[{"from":0,"to":1,"translation":"..."}]}';
  const BRIDGE_CHANNEL = "touch-youtube-translate-v1";
  const CAPTION_MAX_BYTES = 10 * 1024 * 1024;
  const CAPTION_MAX_FRAGMENTS = 50000;
  const SUBTITLE_MAX_CHARS = 180;
  const SUBTITLE_MAX_MS = 8000;
  const SUBTITLE_PAUSE_MS = 1000;
  const SUBTITLE_BATCH_MS = 30000;
  const SUBTITLE_BATCH_CHARS = 6000;
  const SUBTITLE_LOOKAHEAD_MS = 60000;
  const nativeSubtitleTracks = new WeakMap();
  let subtitleSession = null;
  let subtitleView = null;
  let subtitleIntent = 0;

  function loadSubtitlePreferences() {
    const saved = GM_getValue(PREFERENCES_KEY, {});
    const defaultSize = globalThis.matchMedia?.("(max-width: 600px)")?.matches ? 18 : 22;
    return {
      smart: saved?.smart !== false,
      translationOnly: saved?.translationOnly === true,
      fontSize: Math.max(14, Math.min(36, Number(saved?.fontSize) || defaultSize)),
      bottom: Math.max(8, Math.min(35, Number(saved?.bottom) || 12)),
    };
  }
