  const REQUEST_TIMEOUT_MS = 60000;
  const MAX_RETRIES = 2;
  const structuredOutputFallbackModels = new Set();

  function endpointFor(baseURL, model = "", apiFormat = "chat-completions") {
    const url = new URL(baseURL);
    let path = url.pathname.replace(/\/+$/, "");
    if (apiFormat === "gemini-native") {
      if (
        /\/(?:openai|compat|chat\/completions)$/.test(path) ||
        /^(?:\/v1\/[^/]+\/[^/]+)?\/compat(?:\/|$)/.test(path)
      ) {
        throw new Error(
          "Gemini (native) needs a native Base URL, such as https://generativelanguage.googleapis.com/v1beta or your gateway's /google-ai-studio route. Do not put /google-ai-studio after /compat.",
        );
      }
      const modelID = String(model || "")
        .trim()
        .replace(/^(?:google(?:-ai-studio)?\/)?(?:models\/)?/i, "");
      if (
        !modelID ||
        modelID.includes("/") ||
        modelID === "." ||
        modelID === ".." ||
        /[?#\\]/.test(modelID)
      ) {
        throw new Error("Invalid Gemini model name.");
      }
      path = path.replace(/\/models\/[^/]+:(?:generateContent|streamGenerateContent)$/i, "");
      if (/\/models$/i.test(path)) {
        path += `/${encodeURIComponent(modelID)}:generateContent`;
      } else {
        if (!/\/v1(?:beta\d*)?$/i.test(path)) path += "/v1beta";
        path += `/models/${encodeURIComponent(modelID)}:generateContent`;
      }
    } else {
      if (/:(?:generateContent|streamGenerateContent)$/i.test(path)) {
        throw new Error("Select Gemini (native) for a generateContent endpoint.");
      }
      if (!path) path = "/v1";
      if (!path.endsWith("/chat/completions")) path += "/chat/completions";
    }
    url.pathname = path;
    url.hash = "";
    return url.href;
  }

  function thinkingLevelFor(settings) {
    return THINKING_LEVELS.includes(settings?.thinkingLevel)
      ? settings.thinkingLevel
      : "low";
  }

  function retryDelayFor(response, attempt = 0) {
    const match = /^retry-after:\s*(.+)$/im.exec(String(response?.responseHeaders || ""));
    if (match) {
      const value = match[1].trim();
      const seconds = Number(value);
      let delay = Number.isFinite(seconds) ? seconds * 1000 : NaN;
      if (Number.isNaN(delay)) {
        const retryAt = Date.parse(value);
        if (!Number.isNaN(retryAt)) delay = retryAt - Date.now();
      }
      if (Number.isFinite(delay)) return Math.max(0, delay);
    }
    const base = 1000 * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(base + jitter, 10000);
  }

  function truncateDiagnostic(text, limit = 600) {
    const value = String(text || "").trim();
    if (!value) return "(empty)";
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }

  function redactProviderDiagnostic(message, apiKey) {
    const text = String(message || "").replace(/https?:\/\/[^\s"'<>]+/gi, (value) => {
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "[redacted URL]";
      }
    });
    return apiKey ? text.split(apiKey).join("[redacted]") : text;
  }

  function extractErrorMessage(responseText) {
    try {
      const data = JSON.parse(responseText || "{}");
      if (typeof data?.error?.message === "string" && data.error.message.trim()) {
        return data.error.message.trim();
      }
      if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
      if (typeof data?.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
    } catch {
      // Fall back to raw response diagnostic.
    }
    return truncateDiagnostic(responseText, 240);
  }

  function structuredOutputUnsupported(status, message) {
    return (
      (status === 400 || status === 422) &&
      /response[_ -]?format|json[_ -]?schema|structured outputs?/i.test(
        String(message || ""),
      )
    );
  }

  function responseFormatError(reason, content, expected = EXPECTED_FORMAT) {
    const error = new Error([
      "Response format mismatch.",
      reason,
      `Expected: ${expected}`,
      "",
      `AI output:\n${truncateDiagnostic(content, 2000)}`,
    ].join("\n"));
    error.code = "TRANSLATION_RESPONSE_ERROR";
    return error;
  }

  function generationConfigFor(settings) {
    return {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: thinkingLevelFor(settings) },
    };
  }

  function providerContent(body, nativeGemini, expectedFormat) {
    const blocked = nativeGemini && body?.promptFeedback?.blockReason;
    const choice = nativeGemini ? body?.candidates?.[0] : body?.choices?.[0];
    const refusal = choice?.message?.refusal;
    const finishReason = String(
      (nativeGemini ? choice?.finishReason : choice?.finish_reason) || "",
    ).toLowerCase();
    let content = nativeGemini ? choice?.content?.parts : choice?.message?.content;
    if (Array.isArray(content)) {
      content = content
        .filter((part) => !part?.thought)
        .map((part) => typeof part?.text === "string" ? part.text : "")
        .join("");
    }
    if (blocked || refusal || /^(?:content_filter|safety|recitation|blocklist|prohibited_content|spii)$/.test(finishReason)) {
      const message = blocked
        ? `Gemini blocked the translation prompt. Reason: ${blocked}`
        : refusal
          ? `The AI refused the translation.\n${refusal}`
          : `The translation was blocked by the AI content safety filter or moderation policy (${finishReason}).`;
      throw Object.assign(new Error(message), { code: "TRANSLATION_RESPONSE_ERROR" });
    }
    if (finishReason && finishReason !== "stop") {
      throw responseFormatError(`The AI response was incomplete. Finish reason: ${finishReason}`, content, expectedFormat);
    }
    return typeof content === "string" ? content : "";
  }

  function sendProviderRequest(settings, {
    expectedFormat = EXPECTED_FORMAT,
    geminiParts,
    imageMimeType,
    parseResponse,
    schema,
    schemaName,
    systemPrompt,
    userContent,
    allowGenericSchemaFallback = false,
    retryInvalidOutput = false,
  }) {
    const nativeGemini = settings.apiFormat === "gemini-native";
    const url = new URL(endpointFor(settings.baseURL, settings.model, settings.apiFormat));
    const modelKey = `${nativeGemini}\u0000${settings.baseURL}\u0000${settings.model}\u0000${schemaName}`;
    const headers = { "Content-Type": "application/json" };
    if (!nativeGemini) headers.Authorization = `Bearer ${settings.apiKey}`;
    else if (/^(?:\/v1\/[^/]+\/[^/]+)?\/google-ai-studio\//.test(url.pathname)) {
      headers["cf-aig-authorization"] = `Bearer ${settings.apiKey}`;
    } else headers["x-goog-api-key"] = settings.apiKey;

    const buildPayload = (useSchema) => {
      if (nativeGemini) {
        const generationConfig = generationConfigFor(settings);
        if (useSchema) generationConfig.responseJsonSchema = schema;
        return {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: geminiParts }],
          generationConfig,
          safetySettings: [
            "HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH",
            "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT",
            "HARM_CATEGORY_CIVIC_INTEGRITY",
          ].map((category) => ({ category, threshold: "OFF" })),
        };
      }
      const payload = {
        model: settings.model,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
        reasoning_effort: thinkingLevelFor(settings),
      };
      if (useSchema) {
        payload.response_format = {
          type: "json_schema",
          json_schema: { name: schemaName, strict: true, schema },
        };
      }
      return payload;
    };

    let currentRequest;
    let retryTimer;
    let settled = false;
    let rejectPromise;
    let attempt = 0;
    let schemaFallbackTried = false;
    const promise = new Promise((resolve, reject) => {
      rejectPromise = reject;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(retryTimer);
        callback(value);
      };
      const httpFailure = (response, useSchema) => {
        const lines = [
          `Translation API error (HTTP ${response.status}).`,
          extractErrorMessage(response.responseText),
          `API format: ${nativeGemini ? "Gemini (native)" : "Chat Completions"}`,
          `Model: ${settings.model}`,
          `Output schema: ${useSchema ? "enabled" : "disabled"}`,
        ];
        if (typeof GM_info !== "undefined" && GM_info.script?.version) {
          lines.push(`${SCRIPT_NAME}: ${GM_info.script.version}`);
        }
        for (const [label, value] of [["Request URL", url.href], ["Response URL", response.finalUrl]]) {
          if (!value) continue;
          try {
            const endpoint = new URL(value);
            lines.push(`${label}: ${endpoint.origin}${endpoint.pathname}`);
          } catch { /* Preserve the provider error when finalUrl is malformed. */ }
        }
        for (const name of ["cf-ray", "cf-aig-log-id"]) {
          const match = String(response.responseHeaders || "").match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
          if (match) lines.push(`${name}: ${match[1].trim()}`);
        }
        if (imageMimeType) lines.push(`Image MIME type: ${imageMimeType}`);
        return new Error(lines.join("\n"));
      };
      const retry = (disableSchema, response) => {
        if (attempt >= MAX_RETRIES || settled) return false;
        const delay = retryDelayFor(response, attempt++);
        retryTimer = setTimeout(() => send(disableSchema), delay);
        return true;
      };
      const send = (disableSchema = false) => {
        if (settled) return;
        const useSchema = !disableSchema && !structuredOutputFallbackModels.has(modelKey);
        const fallback = () => {
          schemaFallbackTried = true;
          send(true);
        };
        try {
          currentRequest = GM_xmlhttpRequest({
            method: "POST", url: url.href, headers,
            data: JSON.stringify(buildPayload(useSchema)),
            anonymous: true, timeout: REQUEST_TIMEOUT_MS,
            onload(response) {
              currentRequest = null;
              if (settled) return;
              try {
                const status = Number(response.status) || 0;
                const responseText = String(response.responseText || "");
                if (status < 200 || status >= 300) {
                  const detail = extractErrorMessage(responseText);
                  if (useSchema && !schemaFallbackTried && (
                    structuredOutputUnsupported(status, detail) ||
                    (nativeGemini && allowGenericSchemaFallback && status === 400)
                  )) {
                    fallback();
                    return;
                  }
                  if ((status === 429 || (status >= 500 && status < 600)) &&
                    !/quota|insufficient_quota|billing/i.test(detail) && retry(disableSchema, response)) return;
                  throw httpFailure(response, useSchema);
                }
                let body;
                try { body = JSON.parse(responseText); }
                catch { throw responseFormatError("Provider did not return valid JSON.", responseText, expectedFormat); }
                const content = providerContent(body, nativeGemini, expectedFormat);
                if (!content.trim()) {
                  if (useSchema && !schemaFallbackTried) { fallback(); return; }
                  throw responseFormatError("The AI returned an empty response.", responseText, expectedFormat);
                }
                let result;
                try { result = parseResponse(content); }
                catch (error) {
                  if (retryInvalidOutput && useSchema && !schemaFallbackTried) { fallback(); return; }
                  throw error;
                }
                if (schemaFallbackTried && disableSchema) structuredOutputFallbackModels.add(modelKey);
                finish(resolve, result);
              } catch (error) { finish(reject, error); }
            },
            onerror() {
              currentRequest = null;
              if (!retry(disableSchema)) finish(reject, new Error(`Could not connect to the translation API (${url.href}).`));
            },
            ontimeout() {
              currentRequest = null;
              if (!retry(disableSchema)) finish(reject, new Error("The translation API timed out."));
            },
            onabort() { finish(reject, cancelledError()); },
          });
        } catch (error) { finish(reject, error); }
      };
      send();
    }).catch((error) => {
      const failure = new Error(redactProviderDiagnostic(errorMessageFor(error), settings.apiKey));
      failure.name = error?.name || "Error";
      if (error?.code) failure.code = error.code;
      throw failure;
    });
    return {
      promise,
      abort() {
        if (settled) return;
        settled = true;
        clearTimeout(retryTimer);
        rejectPromise(cancelledError());
        try { currentRequest?.abort?.(); } catch { /* Cancellation is already settled. */ }
      },
    };
  }
