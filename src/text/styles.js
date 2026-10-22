  function addStyles(root = document.documentElement) {
    if (root.querySelector("style[data-touch-translate]")) return;
    const style = document.createElement("style");
    style.dataset.touchTranslate = "";
    style.textContent = `${COMMON_STYLES}
      .${TRANSLATION_CLASS} {
        box-sizing: border-box !important;
        display: block !important;
        max-height: none !important;
        -webkit-line-clamp: unset !important;
        overflow: visible !important;
        opacity: 0.78 !important;
        margin-block-start: 0.54em !important;
        padding-inline-start: 0.42em !important;
        border-inline-start: 1px solid rgba(127, 127, 127, 0.48) !important;
        pointer-events: auto !important;
        transition: opacity 180ms ease-out !important;
      }
      li.${TRANSLATION_CLASS} {
        display: block !important;
        list-style: none !important;
      }
      .${INDICATOR_CLASS} {
        --touch-translate-progress: 0deg;
        -webkit-appearance: none !important;
        appearance: none !important;
        display: inline-block !important;
        position: relative !important;
        z-index: 2147483646 !important;
        width: 16px !important;
        height: 16px !important;
        margin: 0 !important;
        margin-inline-start: 0.38em !important;
        padding: 0 !important;
        border: 0 solid transparent !important;
        border-radius: 50% !important;
        box-sizing: border-box !important;
        box-shadow: none !important;
        filter: none !important;
        text-shadow: none !important;
        font: 16px/1 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
        text-indent: 0 !important;
        translate: none !important;
        vertical-align: middle !important;
        pointer-events: none !important;
      }
      .${INDICATOR_CLASS}::before,
      .${INDICATOR_CLASS}::after {
        box-sizing: border-box !important;
        pointer-events: none !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"] {
        background: transparent !important;
        -webkit-mask: none !important;
        mask: none !important;
        opacity: 0.82 !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"]::before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: 50% !important;
        background: conic-gradient(
          currentColor 0 var(--touch-translate-progress),
          rgba(127, 127, 127, 0.32) var(--touch-translate-progress) 1turn
        ) !important;
        opacity: 0.38 !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"]::after {
        content: "" !important;
        position: absolute !important;
        width: 5px !important;
        height: 5px !important;
        inset: 50% auto auto 50% !important;
        border-radius: 50% !important;
        background: currentColor !important;
        transform: translate(-50%, -50%) !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"][data-ready="true"] {
        opacity: 0.94 !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"][data-ready="true"]::before {
        opacity: 0.72 !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"][data-ready="true"]::after {
        transform: translate(-50%, -50%) scale(1.25) !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"][data-action="cancel"]::after,
      .${INDICATOR_CLASS}[data-state="gesture"][data-action="remove"]::after {
        opacity: 0.8 !important;
      }
      .${INDICATOR_CLASS}[data-state="committed"] {
        background: transparent !important;
        -webkit-mask: none !important;
        mask: none !important;
        border: 0 !important;
        opacity: 0.82 !important;
        animation: touch-translate-commit ${COMMIT_HOLD_MS}ms ease-out both !important;
      }
      .${INDICATOR_CLASS}[data-state="committed"]::before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: 50% !important;
        background: currentColor !important;
        opacity: 0.5 !important;
      }
      .${INDICATOR_CLASS}[data-state="committed"]::after {
        content: "" !important;
        position: absolute !important;
        width: 5px !important;
        height: 5px !important;
        inset: 50% auto auto 50% !important;
        border-radius: 50% !important;
        background: currentColor !important;
        transform: translate(-50%, -50%) !important;
      }
      .${INDICATOR_CLASS}[data-state="loading"] {
        background: transparent !important;
        -webkit-mask: none !important;
        mask: none !important;
        opacity: 0.78 !important;
      }
      .${INDICATOR_CLASS}[data-state="loading"]::before {
        content: "" !important;
        position: absolute !important;
        inset: 5.5px !important;
        border-radius: 50% !important;
        background: currentColor !important;
        animation: touch-translate-breathe 760ms ease-in-out infinite alternate !important;
      }
      .${INDICATOR_CLASS}[data-state="loading"]::after {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border: 1px solid currentColor !important;
        border-radius: 50% !important;
        animation: touch-translate-loading-ring 760ms ease-in-out infinite alternate !important;
      }
      .${INDICATOR_CLASS}[data-state="error"] {
        background: transparent !important;
        -webkit-mask: none !important;
        mask: none !important;
        border: 0 !important;
        opacity: 0.9 !important;
      }
      .${INDICATOR_CLASS}[data-state="error"]::before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border-radius: 50% !important;
        background: #c8453c !important;
      }
      .${INDICATOR_CLASS}[data-state="error"]::after {
        color: #fff !important;
      }
      .${INDICATOR_CLASS}[data-state="gesture"][data-action="cancel"]::after,
      .${INDICATOR_CLASS}[data-state="gesture"][data-action="remove"]::after,
      .${INDICATOR_CLASS}[data-state="error"]::after {
        content: "" !important;
        position: absolute !important;
        width: 8px !important;
        height: 8px !important;
        inset: 50% auto auto 50% !important;
        border-radius: 0 !important;
        background:
          linear-gradient(45deg, transparent 42%, currentColor 42% 58%, transparent 58%),
          linear-gradient(-45deg, transparent 42%, currentColor 42% 58%, transparent 58%) !important;
        transform: translate(-50%, -50%) !important;
      }
      @keyframes touch-translate-breathe {
        from { opacity: 0.44; transform: scale(0.7); }
        to { opacity: 0.9; transform: scale(1.15); }
      }
      @keyframes touch-translate-loading-ring {
        from { opacity: 0.22; }
        to { opacity: 0.52; }
      }
      @keyframes touch-translate-commit {
        from { opacity: 0.32; }
        to { opacity: 0.82; }
      }
      @media (prefers-reduced-motion: reduce) {
        .${INDICATOR_CLASS}[data-state="committed"],
        .${INDICATOR_CLASS}[data-state="loading"]::before,
        .${INDICATOR_CLASS}[data-state="loading"]::after {
          animation: none !important;
        }
        .${TRANSLATION_CLASS} {
          transition: none !important;
        }
      }
      @media (prefers-contrast: more) {
        .${TRANSLATION_CLASS},
        .${INDICATOR_CLASS} {
          opacity: 1 !important;
        }
      }
    `;
    root.append(style);
  }
