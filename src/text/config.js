  const SCRIPT_NAME = "Touch Translate";
  const SCRIPT_PREFIX = "touch-translate";
  // Constants and defaults

  const YOUTUBE_COMMENT_SELECTOR = [
    "yt-attributed-string#content-text",
    "yt-formatted-string#content-text",
    "ytm-comment-renderer .YtmCommentRendererText",
    "ytm-comment-renderer .comment-text",
  ].join(", ");
  const BLOCK_SELECTOR =
    `p, li, blockquote, h1, h2, h3, h4, h5, h6, [role='heading'], [slot='title'], [slot='heading'], [slot='header'], ${YOUTUBE_COMMENT_SELECTOR}`;
  const TITLE_BLOCK_SELECTOR =
    "p, h1, h2, h3, h4, h5, h6, [role='heading'], [slot='title'], [slot='heading'], [slot='header']";
  const OVERLAY_LINK_SELECTOR = [
    "a.stretched-link",
    "a[class*='stretched-link']",
    "a.absolute.inset-0",
    "a[class*='inset-0']",
    "a[class*='overlay']",
    "a[slot*='link']",
  ].join(", ");
  const PAGE_CONTAINER_SELECTOR = [
    "html",
    "body",
    "main",
    "[role='main']",
    "[role='feed']",
    "[role='application']",
  ].join(", ");
  const TRANSLATION_CLASS = "touch-translate__translation";
  const INDICATOR_CLASS = "touch-translate__indicator";
  const ERROR_DIALOG_CLASS = "touch-translate__error-dialog";
  const SETTINGS_DIALOG_CLASS = "touch-translate__settings-dialog";
  const TOAST_CLASS = "touch-translate__toast";
  const indicators = new WeakMap();
  const removingTranslations = new WeakSet();
  const CACHE_KEY = "cache-v1";
  const CACHE_LIMIT = 500;
  const BATCH_MAX_ITEMS = 12;
  const BATCH_MAX_CHARS = 6000;
  const FIRST_BATCH_MAX_ITEMS = 4;
  const FIRST_BATCH_MAX_CHARS = 1600;
  const SWIPE_BATCH_MS = 80;
  const PAGE_REFRESH_MS = 160;
  const COMMIT_HOLD_MS = 140;
  const FOUR_FINGER_MAX_MOVE = 24;
  const FOUR_FINGER_MAX_MS = 700;
  const CONTENT_ROOT_SELECTOR = "main, [role='main']";
  const PAGE_CHROME_SELECTOR = [
    "nav",
    "aside",
    "menu",
    "form",
    "[role='navigation']",
    "[role='menu']",
    "[role='banner']",
    "[role='contentinfo']",
    "[aria-hidden='true']",
  ].join(", ");
  const NON_TEXT_SELECTOR = [
    "[data-touch-translate-ui]",
    `.${TRANSLATION_CLASS}`,
    `.${INDICATOR_CLASS}`,
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "object",
    "embed",
    "canvas",
    "video",
    "audio",
    "picture",
    "img",
    "svg",
    "input",
    "textarea",
    "select",
    "button",
    "[hidden]",
    "[aria-hidden='true']",
    ".sr-only",
    ".visually-hidden",
    "[class*='screen-reader']",
    "[class*='visually-hidden']",
  ].join(", ");

  const EXPECTED_FORMAT = '{"translations":["..."]}';
