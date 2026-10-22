  const SCRIPT_NAME = "Touch Image Translate";
  const SCRIPT_PREFIX = "touch-image-translate";
  const CACHE_KEY = "image-cache-v1";
  const CACHE_LIMIT = 150;

  const SWIPE_PINCH_MAX_PX = 48;
  const TWO_FINGER_JOIN_MS = 300;

  const IMAGE_MIN_WIDTH = 120;
  const IMAGE_MIN_HEIGHT = 90;
  const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
  const IMAGE_MAX_EDGE = 1600;
  const IMAGE_MAX_PIXELS = 4096 * 4096;
  const IMAGE_MAX_REGIONS = 99;
  const EXPECTED_FORMAT =
    '{"has_text":true,"regions":[{"box_2d":[ymin,xmin,ymax,xmax],"translation":"<translated text>"}]}';

  const IMAGE_OVERLAY_CLASS = "touch-image-translate__overlay";
  const IMAGE_BUTTON_CLASS = "touch-image-translate__button";
  const IMAGE_REGIONS_CLASS = "touch-image-translate__regions";
  const IMAGE_REGION_CLASS = "touch-image-translate__region";
  const IMAGE_ITEM_CLASS = "touch-image-translate__item";
  const IMAGE_BADGE_CLASS = "touch-image-translate__badge";
  const IMAGE_TEXT_CLASS = "touch-image-translate__text";
  const IMAGE_VIEWER_CLASS = "touch-image-translate__viewer";
  const IMAGE_VIEWER_BAR_CLASS = "touch-image-translate__viewer-bar";
  const IMAGE_VIEWER_STAGE_CLASS = "touch-image-translate__viewer-stage";
  const IMAGE_VIEWER_CANVAS_CLASS = "touch-image-translate__viewer-canvas";
  const IMAGE_VIEWER_IMG_CLASS = "touch-image-translate__viewer-img";
  const IMAGE_VIEWER_SHEET_CLASS = "touch-image-translate__viewer-sheet";
  const IMAGE_VIEWER_ACTIVE_CLASS = "touch-image-translate__viewer-active";
  const IMAGE_VIEWER_LIST_CLASS = "touch-image-translate__viewer-list";
  const ERROR_DIALOG_CLASS = "touch-image-translate__error";
  const SETTINGS_DIALOG_CLASS = "touch-image-translate__settings";
  const TOAST_CLASS = "touch-image-translate__toast";


  const imageStates = new WeakMap();
  const trackedImages = new Set();
  let activeImageViewer = null;
  let swipe = null;
  let firstTouch = null;
  let lastSwipeCommitAt = 0;
