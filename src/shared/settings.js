  let settingsPrompt;

  const SETTINGS_KEY = "settings-v1";
  const DEFAULT_SETTINGS = {
    apiFormat: "chat-completions",
    baseURL: "https://api.openai.com/v1",
    model: "",
    apiKey: "",
    targetLanguage: globalThis.navigator?.language || "English",
    temperature: 0.2,
  };


  function isPrivateOrLocalHost(hostname) {
    const host = String(hostname || "")
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".lan") ||
      host.endsWith(".home.arpa")
    ) {
      return true;
    }
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 0 || a === 127) return true;
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      return false;
    }
    if (
      host === "::1" ||
      host === "0:0:0:0:0:0:0:1" ||
      /^fe[89ab][0-9a-f]:/i.test(host) ||
      /^f[cd][0-9a-f]{2}:/i.test(host)
    ) {
      return true;
    }
    return false;
  }

  function cleanSettings(input = {}, fallback = DEFAULT_SETTINGS) {
    let temperature = fallback.temperature ?? 0.2;
    if (
      input.temperature !== undefined &&
      input.temperature !== null &&
      input.temperature !== ""
    ) {
      const parsed = Number(input.temperature);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 2) {
        throw new Error("Temperature must be a number between 0 and 2.");
      }
      temperature = Math.round(parsed * 100) / 100;
    }

    const value = {
      // Older settings without a format default to Chat Completions.
      apiFormat: input.apiFormat ?? DEFAULT_SETTINGS.apiFormat,
      baseURL:
        typeof input.baseURL === "string"
          ? input.baseURL.trim()
          : fallback.baseURL,
      model:
        typeof input.model === "string" ? input.model.trim() : fallback.model,
      apiKey:
        typeof input.apiKey === "string"
          ? input.apiKey.trim()
          : fallback.apiKey,
      targetLanguage:
        typeof input.targetLanguage === "string"
          ? input.targetLanguage.trim()
          : fallback.targetLanguage,
      temperature,
    };

    if (!["chat-completions", "gemini-native"].includes(value.apiFormat)) {
      throw new Error("API format must be Chat Completions or Gemini (native).");
    }
    if (value.baseURL) {
      const url = new URL(value.baseURL);
      const localHTTP =
        url.protocol === "http:" && isPrivateOrLocalHost(url.hostname);
      if (url.protocol !== "https:" && !localHTTP) {
        throw new Error(
          "Base URL must use HTTPS; localhost or private network is the only exception.",
        );
      }
      value.baseURL = url.href.replace(/\/$/, "");
    }
    return value;
  }

  function requireReadySettings(settings) {
    if (
      !settings.baseURL ||
      !settings.model ||
      !settings.apiKey ||
      !settings.targetLanguage
    ) {
      throw new Error("Complete the API setup first.");
    }
    endpointFor(settings.baseURL, settings.model, settings.apiFormat);
    return settings;
  }

  function parseImportedSettings(payload, current = DEFAULT_SETTINGS) {
    if (payload?.version !== undefined && payload.version !== 1) {
      throw new Error("Unsupported settings file format.");
    }
    const rawSettings =
      payload?.version === 1 &&
      payload.settings &&
      typeof payload.settings === "object" &&
      !Array.isArray(payload.settings)
        ? payload.settings
        : payload &&
            typeof payload === "object" &&
            !Array.isArray(payload) &&
            ("baseURL" in payload || "model" in payload || "apiFormat" in payload)
          ? payload
          : null;
    if (!rawSettings) {
      throw new Error("Unsupported settings file format.");
    }
    const next = cleanSettings(rawSettings, current);
    if (
      typeof rawSettings.apiKey !== "string" &&
      (next.baseURL !== current.baseURL || next.apiFormat !== current.apiFormat)
    ) {
      next.apiKey = "";
    }
    if (!next.baseURL || !next.model || !next.targetLanguage) {
      throw new Error(
        "The settings file is missing the Base URL, model, or target language.",
      );
    }
    return next;
  }

  function loadSettings() {
    try {
      return cleanSettings(GM_getValue(SETTINGS_KEY, {}), DEFAULT_SETTINGS);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function configureSettings() {
    settingsPrompt ||= showSettingsDialog().finally(() => {
      settingsPrompt = null;
    });
    return settingsPrompt;
  }

  async function showSettingsDialog() {
    const current = loadSettings();
    const dialog = document.createElement("dialog");
    dialog.className = SETTINGS_DIALOG_CLASS;
    dialog.dataset.touchTranslateUi = "";
    dialog.setAttribute("aria-labelledby", `${SCRIPT_PREFIX}-settings-title`);

    const form = document.createElement("form");
    const title = document.createElement("h2");
    title.id = `${SCRIPT_PREFIX}-settings-title`;
    title.textContent = `${SCRIPT_NAME} API settings`;
    const inputs = {};
    const field = (labelText, name, type, value, required = true) => {
      const label = document.createElement("label");
      const input = document.createElement(
        type === "select" ? "select" : "input",
      );
      const id = `${SCRIPT_PREFIX}-settings-${name}`;
      label.htmlFor = id;
      label.textContent = labelText;
      input.id = id;
      input.name = name;
      if (type !== "select") input.type = type;
      input.value = value;
      input.required = required;
      input.autocomplete = "off";
      input.spellcheck = false;
      if (name !== "targetLanguage") {
        input.setAttribute("autocapitalize", "none");
      }
      label.append(input);
      inputs[name] = input;
      return label;
    };

    const apiFormat = field("API format", "apiFormat", "select", "");
    for (const [value, text] of [
      ["chat-completions", "Chat Completions"],
      ["gemini-native", "Gemini (native)"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      inputs.apiFormat.append(option);
    }
    inputs.apiFormat.value = current.apiFormat;

    const baseURL = field("Base URL", "baseURL", "url", current.baseURL);
    const model = field("Model", "model", "text", current.model);
    const targetLanguage = field(
      "Target language",
      "targetLanguage",
      "text",
      current.targetLanguage,
    );
    const temperature = field(
      "Temperature (0.0 - 2.0)",
      "temperature",
      "number",
      current.temperature ?? 0.2,
      false,
    );
    inputs.temperature.step = "0.05";
    inputs.temperature.min = "0";
    inputs.temperature.max = "2";
    inputs.temperature.placeholder = "0.2";
    const temperatureNotice = document.createElement("small");
    temperatureNotice.textContent = "This model uses its default sampling. Medium thinking favors translation quality and may take longer.";
    const updateTemperature = () => {
      const useDefault = inputs.apiFormat.value === "gemini-native" &&
        !Object.hasOwn(generationConfigFor({ model: inputs.model.value }), "temperature");
      inputs.temperature.disabled = useDefault;
      temperatureNotice.hidden = !useDefault;
    };
    inputs.apiFormat.addEventListener("change", updateTemperature);
    inputs.model.addEventListener("input", updateTemperature);
    updateTemperature();
    const apiKey = field(
      "API Key",
      "apiKey",
      "password",
      "",
      !current.apiKey,
    );
    if (current.apiKey) {
      inputs.apiKey.placeholder = "Leave blank to keep current key";
    }

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
    form.append(
      title,
      apiFormat,
      baseURL,
      model,
      targetLanguage,
      temperature,
      temperatureNotice,
      apiKey,
      error,
      actions,
    );
    dialog.append(form);
    (document.body || document.documentElement).append(dialog);

    return new Promise((resolve) => {
      let result = null;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
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
        const data = new FormData(form);
        try {
          result = requireReadySettings(
            cleanSettings(
              {
                apiFormat: data.get("apiFormat"),
                baseURL: data.get("baseURL"),
                model: data.get("model"),
                targetLanguage: data.get("targetLanguage"),
                temperature: data.get("temperature"),
                apiKey: data.get("apiKey") || current.apiKey,
              },
              current,
            ),
          );
          GM_setValue(SETTINGS_KEY, result);
          closeDialog();
          toast("API settings saved");
        } catch (settingsError) {
          error.textContent = errorMessageFor(settingsError);
          error.hidden = false;
        }
      });
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      (current.apiKey ? inputs.model : inputs.apiKey).focus();
    });
  }

  async function readySettings() {
    try {
      return requireReadySettings(loadSettings());
    } catch {
      return configureSettings();
    }
  }

  async function exportSettings() {
    const settings = loadSettings();
    if (!settings.baseURL || !settings.model) {
      alert("There are no complete settings to export.");
      return;
    }
    const includeKey =
      Boolean(settings.apiKey) &&
      confirm("Include the API key as plain text in the export?");
    const exportedSettings = {
      apiFormat: settings.apiFormat,
      baseURL: settings.baseURL,
      model: settings.model,
      targetLanguage: settings.targetLanguage,
      temperature: settings.temperature ?? 0.2,
    };
    if (includeKey) exportedSettings.apiKey = settings.apiKey;
    const json = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: exportedSettings,
      },
      null,
      2,
    );
    const file = new File([json], "touch-translate.settings.json", {
      type: "application/json",
    });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Touch Translate settings",
        });
        return;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
    }
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(json, "text");
      alert(
        "This browser cannot share files. The settings JSON was copied to the clipboard.",
      );
      return;
    }
    const blob = new Blob([`${json}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "touch-translate.settings.json";
    link.style.display = "none";
    (document.body || document.documentElement).append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Settings exported");
  }

  function importSettings() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener(
      "change",
      async () => {
        try {
          const file = input.files?.[0];
          if (!file) return;
          const payload = JSON.parse(await file.text());
          const next = parseImportedSettings(payload, loadSettings());
          GM_setValue(SETTINGS_KEY, next);
          alert(
            next.apiKey
              ? "Settings imported."
              : "Settings imported. Configure the API key separately.",
          );
        } catch (error) {
          alert(`Import failed: ${error.message}`);
        }
      },
      { once: true },
    );
    input.click();
  }

  function registerCommonMenus() {
    GM_registerMenuCommand(`${SCRIPT_NAME}: Configure API`, configureSettings);
    GM_registerMenuCommand(`${SCRIPT_NAME}: Clear API settings`, () => {
      if (!confirm("Remove the saved API format, Base URL, model, target language, and API key?")) return;
      GM_deleteValue(SETTINGS_KEY);
      toast("API settings cleared");
    });
    GM_registerMenuCommand(`${SCRIPT_NAME}: Export settings`, () => {
      showMenuAction("Export settings", exportSettings);
    });
    GM_registerMenuCommand(`${SCRIPT_NAME}: Import settings`, () => {
      showMenuAction("Choose settings file", importSettings);
    });
    GM_registerMenuCommand(`${SCRIPT_NAME}: Clear cache`, () => {
      GM_deleteValue(CACHE_KEY);
      toast("Translation cache cleared");
    });
  }
