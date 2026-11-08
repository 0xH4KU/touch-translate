  function addStyles(root = document.documentElement) {
    if (root.querySelector("style[data-touch-image-translate]")) return;
    const style = document.createElement("style");
    style.dataset.touchImageTranslate = "";
    style.textContent = `${COMMON_STYLES}
      @keyframes touch-image-translate-breathe {
        from { opacity: 0.44; transform: scale(0.7); }
        to { opacity: 0.9; transform: scale(1.15); }
      }
      @keyframes touch-image-translate-ring {
        from { opacity: 0.22; }
        to { opacity: 0.52; }
      }
      .${IMAGE_OVERLAY_CLASS} {
        position: absolute !important;
        z-index: 2147483645 !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        pointer-events: none !important;
        overflow: hidden !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      .${IMAGE_OVERLAY_CLASS}[hidden],
      .${IMAGE_BUTTON_CLASS}[hidden] {
        display: none !important;
      }
      .${IMAGE_BUTTON_CLASS} {
        --touch-image-translate-progress: 0deg;
        -webkit-appearance: none !important;
        appearance: none !important;
        position: absolute !important;
        top: 8px !important;
        right: 8px !important;
        z-index: 2 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 30px !important;
        height: 30px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 1px solid rgba(255, 255, 255, 0.24) !important;
        border-radius: 50% !important;
        box-sizing: border-box !important;
        background: rgba(22, 22, 24, 0.66) !important;
        color: rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.28) !important;
        -webkit-backdrop-filter: blur(8px) saturate(160%) !important;
        backdrop-filter: blur(8px) saturate(160%) !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        transition: opacity 150ms ease-out, transform 120ms ease-out, background-color 150ms ease-out !important;
      }
      .${IMAGE_BUTTON_CLASS}:active {
        transform: scale(0.92) !important;
      }
      .${IMAGE_BUTTON_CLASS} > svg {
        width: 15px !important;
        height: 15px !important;
        display: block !important;
        pointer-events: none !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="gesture"] {
        pointer-events: none !important;
        opacity: 0.9 !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="gesture"]::before {
        content: "" !important;
        position: absolute !important;
        inset: 1px !important;
        border-radius: 50% !important;
        background: conic-gradient(
          #ffffff 0 var(--touch-image-translate-progress),
          rgba(255, 255, 255, 0.2) var(--touch-image-translate-progress) 1turn
        ) !important;
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)) !important;
        mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)) !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="gesture"][data-ready="true"] {
        background: rgba(88, 101, 242, 0.92) !important;
        border-color: rgba(255, 255, 255, 0.65) !important;
        transform: scale(1.08) !important;
        opacity: 1 !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="gesture"][data-action="cancel"][data-ready="true"] {
        background: rgba(200, 69, 60, 0.92) !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="loading"] > svg,
      .${IMAGE_BUTTON_CLASS}[data-state="error"] > svg {
        display: none !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="done"] {
        background: rgba(88, 101, 242, 0.9) !important;
        border-color: rgba(255, 255, 255, 0.48) !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="loading"]::before {
        content: "" !important;
        position: absolute !important;
        width: 6px !important;
        height: 6px !important;
        border-radius: 50% !important;
        background: #fff !important;
        animation: touch-image-translate-breathe 760ms ease-in-out infinite alternate !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="loading"]::after {
        content: "" !important;
        position: absolute !important;
        width: 16px !important;
        height: 16px !important;
        border: 1.2px solid rgba(255, 255, 255, 0.88) !important;
        border-radius: 50% !important;
        box-sizing: border-box !important;
        animation: touch-image-translate-ring 760ms ease-in-out infinite alternate !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="error"] {
        background: #c8453c !important;
        border-color: rgba(255, 255, 255, 0.32) !important;
      }
      .${IMAGE_BUTTON_CLASS}[data-state="error"]::after {
        content: "" !important;
        position: absolute !important;
        width: 10px !important;
        height: 10px !important;
        inset: 50% auto auto 50% !important;
        background:
          linear-gradient(45deg, transparent 42%, currentColor 42% 58%, transparent 58%),
          linear-gradient(-45deg, transparent 42%, currentColor 42% 58%, transparent 58%) !important;
        transform: translate(-50%, -50%) !important;
      }
      .${IMAGE_VIEWER_CLASS} {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        max-width: 100vw !important;
        height: 100dvh !important;
        max-height: 100dvh !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: rgba(10, 12, 16, 0.96) !important;
        color: #f5f5f7 !important;
        font: 15px/1.48 -apple-system, BlinkMacSystemFont, sans-serif !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
        z-index: 2147483647 !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }
      .${IMAGE_VIEWER_CLASS}::backdrop {
        background: rgba(0, 0, 0, 0.85) !important;
      }
      .${IMAGE_VIEWER_BAR_CLASS} {
        position: relative !important;
        z-index: 3 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
        padding: max(10px, env(safe-area-inset-top, 10px)) 14px 10px !important;
        background: rgba(18, 20, 26, 0.86) !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
        -webkit-backdrop-filter: blur(12px) !important;
        backdrop-filter: blur(12px) !important;
      }
      .${IMAGE_VIEWER_BAR_CLASS} > [data-viewer-counter] {
        font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, sans-serif !important;
        color: rgba(255, 255, 255, 0.88) !important;
      }
      .${IMAGE_VIEWER_BAR_CLASS} > div {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }
      .${IMAGE_VIEWER_BAR_CLASS} button,
      .${IMAGE_VIEWER_SHEET_CLASS} button {
        -webkit-appearance: none !important;
        appearance: none !important;
        min-height: 44px !important;
        padding: 0 10px !important;
        border: 1px solid rgba(255, 255, 255, 0.18) !important;
        border-radius: 6px !important;
        background: rgba(255, 255, 255, 0.1) !important;
        color: #f5f5f7 !important;
        font: 600 12px/1 -apple-system, BlinkMacSystemFont, sans-serif !important;
        cursor: pointer !important;
        touch-action: manipulation !important;
      }
      .${IMAGE_VIEWER_BAR_CLASS} button[hidden],
      .${IMAGE_VIEWER_SHEET_CLASS} [hidden] {
        display: none !important;
      }
      .${IMAGE_VIEWER_STAGE_CLASS} {
        position: relative !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        touch-action: none !important;
      }
      .${IMAGE_VIEWER_CANVAS_CLASS} {
        position: relative !important;
        display: inline-block !important;
        max-width: 96vw !important;
        max-height: 66dvh !important;
        transform-origin: center center !important;
      }
      .${IMAGE_VIEWER_IMG_CLASS} {
        display: block !important;
        max-width: 96vw !important;
        max-height: 66dvh !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
        pointer-events: none !important;
      }
      .${IMAGE_REGIONS_CLASS} {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: block !important;
        overflow: visible !important;
        pointer-events: none !important;
      }
      .${IMAGE_VIEWER_CLASS}[data-hide-pins="true"] .${IMAGE_REGIONS_CLASS} {
        display: none !important;
      }
      .${IMAGE_REGION_CLASS} {
        cursor: pointer !important;
        pointer-events: auto !important;
      }
      .${IMAGE_VIEWER_SHEET_CLASS} {
        position: relative !important;
        z-index: 3 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 8px !important;
        max-height: 44dvh !important;
        padding: 12px 14px max(14px, env(safe-area-inset-bottom, 14px)) !important;
        background: rgba(20, 22, 28, 0.92) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.12) !important;
        -webkit-backdrop-filter: blur(16px) saturate(160%) !important;
        backdrop-filter: blur(16px) saturate(160%) !important;
        user-select: text !important;
        -webkit-user-select: text !important;
      }
      .${IMAGE_VIEWER_CLASS}[data-expanded="true"] .${IMAGE_VIEWER_SHEET_CLASS} {
        max-height: 64dvh !important;
      }
      .${IMAGE_VIEWER_SHEET_CLASS} > [data-sheet-header]:not([hidden]) {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 8px !important;
      }
      .${IMAGE_VIEWER_SHEET_CLASS} > [data-sheet-header] > div {
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
      }
      .${IMAGE_VIEWER_ACTIVE_CLASS} {
        display: flex !important;
        align-items: flex-start !important;
        gap: 8px !important;
        padding: 8px 10px !important;
        border-radius: 8px !important;
        background: rgba(245, 158, 11, 0.14) !important;
        border: 1px solid rgba(245, 158, 11, 0.35) !important;
        max-height: 18dvh !important;
        overflow-y: auto !important;
      }
      .${IMAGE_VIEWER_ACTIVE_CLASS} > .${IMAGE_BADGE_CLASS} {
        background: #f59e0b !important;
      }
      .${IMAGE_VIEWER_LIST_CLASS} {
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
        overflow-y: auto !important;
        max-height: 36dvh !important;
        padding-top: 4px !important;
        border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
      }
      .${IMAGE_ITEM_CLASS} {
        display: flex !important;
        align-items: baseline !important;
        gap: 8px !important;
        padding: 6px 8px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
      }
      .${IMAGE_ITEM_CLASS}[data-active="true"] {
        background: rgba(245, 158, 11, 0.16) !important;
      }
      .${IMAGE_BADGE_CLASS} {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 1.5em !important;
        height: 1.5em !important;
        padding: 0 0.36em !important;
        border-radius: 4px !important;
        box-sizing: border-box !important;
        background: rgba(88, 101, 242, 0.9) !important;
        color: #fff !important;
        font: 700 12px/1 -apple-system, BlinkMacSystemFont, sans-serif !important;
        flex-shrink: 0 !important;
      }
      .${IMAGE_ITEM_CLASS}[data-active="true"] > .${IMAGE_BADGE_CLASS} {
        background: #f59e0b !important;
      }
      .${IMAGE_TEXT_CLASS} {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        overflow-wrap: anywhere !important;
        color: #f5f5f7 !important;
        font: 14px/1.48 -apple-system, BlinkMacSystemFont, sans-serif !important;
      }
      @media (prefers-reduced-motion: reduce) {
        .${IMAGE_BUTTON_CLASS} { transition: none !important; }
        .${IMAGE_BUTTON_CLASS}[data-state="loading"]::before,
        .${IMAGE_BUTTON_CLASS}[data-state="loading"]::after { animation: none !important; }
      }
    `;
    root.append(style);
  }
