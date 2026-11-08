  const OCR_SETTINGS_KEY = "ocr-settings-v1";
  const OCR_PROVIDERS = ["none", "google", "azure"];
  let ocrSettingsPrompt;

  function cleanOcrSettings(input = {}, fallback = {}) {
    const provider = String(input.provider ?? fallback.provider ?? "none");
    if (!OCR_PROVIDERS.includes(provider)) {
      throw new Error("OCR provider must be None, Google Cloud Vision, or Azure AI Vision.");
    }
    const value = {
      provider,
      apiKey: String(input.apiKey ?? fallback.apiKey ?? "").trim(),
      endpoint: String(input.endpoint ?? fallback.endpoint ?? "").trim(),
    };
    if (provider === "none") return value;
    if (!value.apiKey) throw new Error("Enter the OCR API key.");
    if (provider === "azure") {
      let url;
      try {
        url = new URL(value.endpoint);
      } catch {
        throw new Error("Enter the Azure endpoint, such as https://<name>.cognitiveservices.azure.com.");
      }
      if (url.protocol !== "https:") throw new Error("The Azure endpoint must use HTTPS.");
      value.endpoint = url.origin;
    }
    return value;
  }

  function loadOcrSettings() {
    try {
      return cleanOcrSettings(GM_getValue(OCR_SETTINGS_KEY, {}));
    } catch {
      return { provider: "none", apiKey: "", endpoint: "" };
    }
  }

  function configureOcrSettings() {
    ocrSettingsPrompt ||= showOcrSettingsDialog().finally(() => {
      ocrSettingsPrompt = null;
    });
    return ocrSettingsPrompt;
  }

  function showOcrSettingsDialog() {
    const current = loadOcrSettings();
    const dialog = document.createElement("dialog");
    dialog.className = SETTINGS_DIALOG_CLASS;
    dialog.dataset.touchTranslateUi = "";
    dialog.setAttribute("aria-labelledby", `${SCRIPT_PREFIX}-ocr-title`);
    const form = document.createElement("form");
    const title = document.createElement("h2");
    title.id = `${SCRIPT_PREFIX}-ocr-title`;
    title.textContent = `${SCRIPT_NAME} OCR settings`;

    const field = (labelText, name, type) => {
      const label = document.createElement("label");
      const input = document.createElement(type === "select" ? "select" : "input");
      input.id = `${SCRIPT_PREFIX}-ocr-${name}`;
      input.name = name;
      if (type !== "select") input.type = type;
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("autocapitalize", "none");
      label.htmlFor = input.id;
      label.textContent = labelText;
      label.append(input);
      return { input, label };
    };
    const provider = field("OCR provider", "provider", "select");
    for (const [value, text] of [
      ["none", "None (model predicts boxes)"],
      ["google", "Google Cloud Vision"],
      ["azure", "Azure AI Vision"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      provider.input.append(option);
    }
    provider.input.value = current.provider;
    const endpoint = field("Azure endpoint", "endpoint", "url");
    endpoint.input.value = current.endpoint;
    endpoint.input.placeholder = "https://<name>.cognitiveservices.azure.com";
    const apiKey = field("OCR API key", "apiKey", "password");
    if (current.apiKey) apiKey.input.placeholder = "Leave blank to keep current key";
    const syncFields = () => {
      endpoint.label.hidden = provider.input.value !== "azure";
      apiKey.label.hidden = provider.input.value === "none";
    };
    provider.input.addEventListener("change", syncFields);
    syncFields();

    const error = document.createElement("p");
    error.dataset.error = "";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const actions = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const save = document.createElement("button");
    save.type = "submit";
    save.dataset.action = "save";
    save.textContent = "Save";
    actions.append(cancel, save);
    form.append(title, provider.label, endpoint.label, apiKey.label, error, actions);
    dialog.append(form);
    (document.body || document.documentElement).append(dialog);

    return new Promise((resolve) => {
      let result = null;
      const finish = () => {
        dialog.remove();
        resolve(result);
      };
      const closeDialog = () => {
        if (typeof dialog.close === "function") dialog.close();
        else finish();
      };
      cancel.addEventListener("click", closeDialog);
      dialog.addEventListener("close", finish, { once: true });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        try {
          const sameProvider = provider.input.value === current.provider;
          result = cleanOcrSettings({
            provider: provider.input.value,
            endpoint: endpoint.input.value,
            // A stored key belongs to its provider; switching providers needs a new key.
            apiKey: apiKey.input.value || (sameProvider ? current.apiKey : ""),
          });
          GM_setValue(OCR_SETTINGS_KEY, result);
          closeDialog();
          toast("OCR settings saved");
        } catch (settingsError) {
          error.textContent = errorMessageFor(settingsError);
          error.hidden = false;
        }
      });
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      provider.input.focus();
    });
  }

  function polygonToBox(points, width, height) {
    const xs = points.map((point) => Number(point?.x) || 0);
    const ys = points.map((point) => Number(point?.y) || 0);
    const scale = (value, size) => clampNumber(Math.round((value / size) * 1000), 0, 1000);
    const box = [
      scale(Math.min(...ys), height),
      scale(Math.min(...xs), width),
      scale(Math.max(...ys), height),
      scale(Math.max(...xs), width),
    ];
    return box[0] < box[2] && box[1] < box[3] ? box : null;
  }

  // Google returns paragraphs; Azure returns lines. Both become numbered units with 0-1000 boxes.
  function parseOcrResponse(provider, body, fallbackSize = {}) {
    const units = [];
    const push = (text, points, width, height) => {
      const clean = String(text || "").trim();
      if (!clean || !Array.isArray(points) || !points.length || !(width > 0) || !(height > 0)) return;
      const box = polygonToBox(points, width, height);
      if (box) units.push({ id: units.length + 1, text: clean, box_2d: box });
    };
    if (provider === "google") {
      const response = body?.responses?.[0];
      if (response?.error?.message) throw new Error(`Google Cloud Vision error: ${response.error.message}`);
      const breaks = { SPACE: " ", SURE_SPACE: " ", EOL_SURE_SPACE: "\n", LINE_BREAK: "\n" };
      for (const page of response?.fullTextAnnotation?.pages || []) {
        const width = Number(page.width) || fallbackSize.width;
        const height = Number(page.height) || fallbackSize.height;
        for (const block of page.blocks || []) {
          for (const paragraph of block.paragraphs || []) {
            const text = (paragraph.words || [])
              .flatMap((word) => word.symbols || [])
              .map((symbol) => `${symbol.text || ""}${breaks[symbol.property?.detectedBreak?.type] || ""}`)
              .join("");
            push(text, paragraph.boundingBox?.vertices, width, height);
          }
        }
      }
    } else if (provider === "azure") {
      if (body?.error?.message) throw new Error(`Azure AI Vision error: ${body.error.message}`);
      const width = Number(body?.metadata?.width) || fallbackSize.width;
      const height = Number(body?.metadata?.height) || fallbackSize.height;
      for (const block of body?.readResult?.blocks || []) {
        for (const line of block.lines || []) push(line.text, line.boundingPolygon, width, height);
      }
    }
    return units;
  }

  function requestOcr(imageData, ocr) {
    const base64 = String(imageData?.base64 || "");
    let options;
    if (ocr.provider === "google") {
      options = {
        url: "https://vision.googleapis.com/v1/images:annotate",
        headers: { "Content-Type": "application/json", "x-goog-api-key": ocr.apiKey },
        data: JSON.stringify({
          requests: [{ image: { content: base64 }, features: [{ type: "DOCUMENT_TEXT_DETECTION" }] }],
        }),
      };
    } else if (ocr.provider === "azure") {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      options = {
        url: `${ocr.endpoint}/computervision/imageanalysis:analyze?api-version=2024-02-01&features=read`,
        headers: { "Content-Type": "application/octet-stream", "Ocp-Apim-Subscription-Key": ocr.apiKey },
        data: typeof Blob === "function" ? new Blob([bytes], { type: "application/octet-stream" }) : bytes.buffer,
      };
    } else {
      throw new Error("No OCR provider is configured.");
    }
    let request;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      rejectPromise = reject;
      const fail = (message) => reject(new Error(redactProviderDiagnostic(message, ocr.apiKey)));
      request = GM_xmlhttpRequest({
        method: "POST",
        anonymous: true,
        timeout: REQUEST_TIMEOUT_MS,
        ...options,
        onload(response) {
          let body;
          try {
            body = JSON.parse(response.responseText || "{}");
          } catch {
            body = null;
          }
          const status = Number(response.status) || 0;
          if (status < 200 || status >= 300) {
            fail(`OCR request failed (HTTP ${status}).\n${extractErrorMessage(response.responseText)}`);
            return;
          }
          try {
            resolve(parseOcrResponse(ocr.provider, body, imageData));
          } catch (error) {
            fail(errorMessageFor(error));
          }
        },
        onerror: () => fail("Could not connect to the OCR API."),
        ontimeout: () => fail("The OCR API timed out."),
        onabort: () => reject(cancelledError()),
      });
    });
    return {
      promise,
      abort() {
        rejectPromise?.(cancelledError());
        try { request?.abort?.(); } catch { /* Already settled. */ }
      },
    };
  }
