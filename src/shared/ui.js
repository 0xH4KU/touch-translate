  let toastTimer;
  let dialogRetryElements = [];

  function toast(message, timeout = 1800) {
    let element = document.querySelector(`.${TOAST_CLASS}`);
    if (!element) {
      element = document.createElement("div");
      element.className = TOAST_CLASS;
      element.dataset.touchTranslateUi = "";
      element.setAttribute("aria-atomic", "true");
      document.documentElement.append(element);
    }
    element.textContent = message;
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    element.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = timeout
      ? setTimeout(() => {
        element.hidden = true;
      }, timeout)
      : undefined;
    return element;
  }

  function showErrorDialog(error, retryElements = []) {
    let dialog = document.querySelector(`.${ERROR_DIALOG_CLASS}`);
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = ERROR_DIALOG_CLASS;
      dialog.dataset.touchTranslateUi = "";
      dialog.setAttribute("aria-labelledby", `${SCRIPT_PREFIX}-error-title`);
      dialog.setAttribute("aria-describedby", `${SCRIPT_PREFIX}-error-details`);

      const title = document.createElement("h2");
      title.id = `${SCRIPT_PREFIX}-error-title`;
      title.textContent = `${SCRIPT_NAME}: translation failed`;

      const details = document.createElement("pre");
      details.id = `${SCRIPT_PREFIX}-error-details`;

      const actions = document.createElement("div");
      const close = document.createElement("button");
      close.type = "button";
      close.dataset.action = "close";
      close.textContent = "Close";
      close.autofocus = true;

      const retry = document.createElement("button");
      retry.type = "button";
      retry.dataset.action = "retry";
      retry.textContent = "Retry";

      const closeDialog = () => {
        dialogRetryElements = [];
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      };
      close.addEventListener("click", closeDialog);
      dialog.addEventListener("cancel", () => {
        dialogRetryElements = [];
      });
      retry.addEventListener("click", () => {
        const elements = dialogRetryElements.filter(
          (element) => element?.isConnected && canRetryTranslation(element),
        );
        closeDialog();
        if (elements.length) retryTranslations(elements);
      });

      actions.append(close, retry);
      dialog.append(title, details, actions);
      (document.body || document.documentElement).append(dialog);
    }

    dialogRetryElements = [...new Set(retryElements || [])].filter(
      (element) => element?.isConnected && canRetryTranslation(element),
    );
    dialog.querySelector("pre").textContent = errorMessageFor(error);
    dialog.querySelector('[data-action="retry"]').disabled =
      !dialogRetryElements.length;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector('[data-action="close"]').focus();
  }

  function reportError(error) {
    console.error(`[${SCRIPT_NAME}]`, error);
    const notification = document.querySelector(`.${TOAST_CLASS}`);
    if (notification) notification.hidden = true;
    showErrorDialog(error, error?.retryElements);
  }

  function showMenuAction(label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener(
      "click",
      () => {
        button.parentElement.hidden = true;
        action();
      },
      { once: true },
    );
    const element = toast("", 15000);
    element.replaceChildren(button);
    element.removeAttribute("role");
    element.removeAttribute("aria-live");
    button.focus();
  }

  const COMMON_STYLES = `
      .${ERROR_DIALOG_CLASS},
      .${SETTINGS_DIALOG_CLASS} {
        position: fixed !important;
        inset: 0 !important;
        width: min(92vw, 520px) !important;
        max-width: 520px !important;
        max-height: min(80dvh, 640px) !important;
        margin: auto !important;
        padding: 20px !important;
        border: 1px solid rgba(0, 0, 0, 0.16) !important;
        border-radius: 8px !important;
        box-sizing: border-box !important;
        background: #fff !important;
        color: #18181a !important;
        font: 15px/1.45 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
        text-align: start !important;
        overflow: auto !important;
        box-shadow: 0 18px 56px rgba(0, 0, 0, 0.28) !important;
      }
      .${ERROR_DIALOG_CLASS}::backdrop,
      .${SETTINGS_DIALOG_CLASS}::backdrop {
        background: rgba(0, 0, 0, 0.48) !important;
        -webkit-backdrop-filter: blur(2px) !important;
        backdrop-filter: blur(2px) !important;
      }
      .${ERROR_DIALOG_CLASS} > h2 {
        margin: 0 !important;
        color: inherit !important;
        font: 650 20px/1.2 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
      }
      .${SETTINGS_DIALOG_CLASS} > form {
        display: grid !important;
        gap: 14px !important;
        margin: 0 !important;
      }
      .${SETTINGS_DIALOG_CLASS} h2 {
        margin: 0 0 2px !important;
        color: inherit !important;
        font: 650 20px/1.2 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
      }
      .${SETTINGS_DIALOG_CLASS} label {
        display: grid !important;
        gap: 6px !important;
        margin: 0 !important;
        color: inherit !important;
        font: 600 13px/1.25 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
      }
      .${SETTINGS_DIALOG_CLASS} input,
      .${SETTINGS_DIALOG_CLASS} select {
        -webkit-appearance: none !important;
        appearance: none !important;
        width: 100% !important;
        min-height: 44px !important;
        margin: 0 !important;
        padding: 9px 11px !important;
        border: 1px solid rgba(0, 0, 0, 0.2) !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
        background: #fff !important;
        color: #18181a !important;
        font: 16px/1.25 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
      }
      .${SETTINGS_DIALOG_CLASS} select {
        -webkit-appearance: auto !important;
        appearance: auto !important;
      }
      .${SETTINGS_DIALOG_CLASS} input:focus-visible,
      .${SETTINGS_DIALOG_CLASS} select:focus-visible {
        border-color: #2878d0 !important;
        outline: 2px solid #2878d0 !important;
        outline-offset: 1px !important;
      }
      .${SETTINGS_DIALOG_CLASS} [data-error] {
        margin: 0 !important;
        color: #b42318 !important;
        font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
      }
      .${SETTINGS_DIALOG_CLASS} [data-error][hidden] {
        display: none !important;
      }
      .${SETTINGS_DIALOG_CLASS} form > div {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
        margin-top: 2px !important;
      }
      .${ERROR_DIALOG_CLASS} > pre {
        max-height: min(48dvh, 360px) !important;
        margin: 16px 0 20px !important;
        padding: 14px 0 !important;
        border-block: 1px solid rgba(0, 0, 0, 0.12) !important;
        color: inherit !important;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace !important;
        letter-spacing: 0 !important;
        overflow: auto !important;
        overflow-wrap: anywhere !important;
        white-space: pre-wrap !important;
      }
      .${ERROR_DIALOG_CLASS} > div {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 8px !important;
      }
      .${ERROR_DIALOG_CLASS} button,
      .${SETTINGS_DIALOG_CLASS} button {
        -webkit-appearance: none !important;
        appearance: none !important;
        flex: 1 1 120px !important;
        min-height: 44px !important;
        padding: 0 16px !important;
        border: 1px solid rgba(0, 0, 0, 0.18) !important;
        border-radius: 6px !important;
        box-sizing: border-box !important;
        background: #f1f1f3 !important;
        color: #18181a !important;
        font: 600 14px/1.2 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
        cursor: pointer !important;
        touch-action: manipulation !important;
      }
      .${ERROR_DIALOG_CLASS} button[data-action="retry"],
      .${SETTINGS_DIALOG_CLASS} button[data-action="save"] {
        border-color: #18181a !important;
        background: #18181a !important;
        color: #fff !important;
      }
      .${ERROR_DIALOG_CLASS} button:active,
      .${SETTINGS_DIALOG_CLASS} button:active {
        opacity: 0.7 !important;
      }
      .${ERROR_DIALOG_CLASS} button:focus-visible,
      .${SETTINGS_DIALOG_CLASS} button:focus-visible {
        outline: 2px solid #2878d0 !important;
        outline-offset: 2px !important;
      }
      .${ERROR_DIALOG_CLASS} button:disabled,
      .${SETTINGS_DIALOG_CLASS} button:disabled {
        cursor: default !important;
        opacity: 0.42 !important;
      }
      .${TOAST_CLASS} {
        position: fixed !important;
        z-index: 2147483647 !important;
        left: 50% !important;
        bottom: max(22px, calc(env(safe-area-inset-bottom, 0px) + 12px)) !important;
        transform: translateX(-50%) !important;
        max-width: min(82vw, 420px) !important;
        padding: 9px 12px !important;
        border-radius: 8px !important;
        background: rgba(22, 22, 24, 0.88) !important;
        color: #fff !important;
        font: 500 13px/1.35 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
        text-align: center !important;
        overflow-wrap: anywhere !important;
        white-space: pre-wrap !important;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24) !important;
        -webkit-backdrop-filter: blur(12px) saturate(180%) !important;
        backdrop-filter: blur(12px) saturate(180%) !important;
        animation: ${SCRIPT_PREFIX}-toast-in 160ms ease-out both !important;
      }
      .${TOAST_CLASS} > button {
        -webkit-appearance: none !important;
        appearance: none !important;
        box-sizing: border-box !important;
        display: block !important;
        min-width: 180px !important;
        min-height: 44px !important;
        max-width: 100% !important;
        padding: 0 14px !important;
        border: 0 !important;
        border-radius: 6px !important;
        background: #fff !important;
        color: #111 !important;
        font: 600 14px/1.2 -apple-system, BlinkMacSystemFont, sans-serif !important;
        letter-spacing: 0 !important;
        white-space: normal !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        transition: opacity 100ms ease-out, transform 100ms ease-out !important;
      }
      .${TOAST_CLASS} > button:active {
        opacity: 0.72 !important;
        transform: scale(0.98) !important;
      }
      .${TOAST_CLASS}[hidden] {
        display: none !important;
      }
      @keyframes ${SCRIPT_PREFIX}-toast-in {
        from { opacity: 0; translate: 0 4px; scale: 0.98; }
        to { opacity: 1; translate: 0; scale: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .${TOAST_CLASS} { animation: none !important; }
        .${TOAST_CLASS} > button { transition: none !important; }
      }
      @media (prefers-reduced-transparency: reduce) {
        .${TOAST_CLASS} {
          background: rgb(22, 22, 24) !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
      }
      @media (prefers-color-scheme: dark) {
        .${ERROR_DIALOG_CLASS},
        .${SETTINGS_DIALOG_CLASS} {
          border-color: rgba(255, 255, 255, 0.18) !important;
          background: #1c1c1e !important;
          color: #f5f5f7 !important;
        }
        .${ERROR_DIALOG_CLASS} > pre {
          border-color: rgba(255, 255, 255, 0.14) !important;
        }
        .${SETTINGS_DIALOG_CLASS} input,
        .${SETTINGS_DIALOG_CLASS} select {
          border-color: rgba(255, 255, 255, 0.22) !important;
          background: #2c2c2e !important;
          color: #f5f5f7 !important;
        }
        .${SETTINGS_DIALOG_CLASS} [data-error] {
          color: #ff9b8f !important;
        }
        .${ERROR_DIALOG_CLASS} button,
        .${SETTINGS_DIALOG_CLASS} button {
          border-color: rgba(255, 255, 255, 0.2) !important;
          background: #323236 !important;
          color: #f5f5f7 !important;
        }
        .${ERROR_DIALOG_CLASS} button[data-action="retry"],
        .${SETTINGS_DIALOG_CLASS} button[data-action="save"] {
          border-color: #f5f5f7 !important;
          background: #f5f5f7 !important;
          color: #18181a !important;
        }
      }
  `;
