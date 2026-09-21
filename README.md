# Touch Translate

A private, touch-first bilingual translation userscript for iOS Safari and Tampermonkey. It keeps the source DOM intact, preserves safe inline formatting and colors, and inserts each translation as a clearly separated block below the original.

[Install Touch Translate with Tampermonkey](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js)

## Usage

- Swipe right on a visible HTML text block. A 60px drag or a shorter deliberate flick commits it; initial finger drift and a small release correction are tolerated once the rightward gesture is clear.
- Swipe the same block again while it is loading to cancel. The network request is also aborted when no other block shares it. Swipe again after the translation appears to remove it.
- Translation errors open a dialog with the provider or response-format details. Retry the failed blocks from the dialog or close it and leave the red status indicator in place.
- Quickly tap with four fingers to start automatic page translation. Modern `IntersectionObserver` scheduling observes translatable content and translates visible blocks with prefetching as you scroll, avoiding layout thrashing. Repeat the gesture to stop and remove the translations added by that automatic run.
- Use the Tampermonkey menu to configure or clear the API settings, translate the page, import or export settings, and clear the cache.

Swipes starting within 12px of the left screen edge are ignored to avoid triggering Safari's back gesture. Native horizontal scrolling takes priority while a scrollable table or other horizontal region can move with the gesture; a right swipe at its leading edge translates normally. Container gaps that would select multiple nested text blocks are ignored.

The userscript is enabled on all regular websites, including frames where Tampermonkey can inject and open Shadow DOM content. Browser-protected pages such as Safari settings, extension stores, and other internal URLs do not allow userscripts to run.

Page translation skips navigation, forms, page headers and footers, plain URLs, and short blocks dominated by links. Repeated text is sent to the API once and the resulting translation is reused, reducing unnecessary API usage. Manual swipes bypass these content filters so you remain in control.

YouTube comment text is recognized on both desktop and mobile pages, including mobile comments wrapped in buttons. Open the comments panel first; automatic translation picks up newly loaded comments and replies. Desktop translations appear below the comment expander so they are not clipped by “Show more”.

## Installation

1. Install and enable Tampermonkey in Safari.
2. Open the [direct install link](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js) and confirm the installation in Tampermonkey.
3. Open the Tampermonkey script menu and run Touch Translate's API setup command. Choose **Chat Completions** (default) or **Gemini (native)** under API format.

For Chat Completions, use a Base URL such as `https://api.openai.com/v1`. The script appends `/chat/completions`; you may also enter a complete `/chat/completions` URL. Local and private network HTTP endpoints (e.g. `http://localhost:11434`, `http://127.0.0.1:11434`, `http://192.168.x.x`, or `http://*.local`) are also supported for self-hosted setups (Ollama, LocalAI, vLLM). Requests use Bearer authentication. Model names and domains never switch the selected API format.

The script defaults to a sampling `temperature` of `0.2` (customizable between `0.0` and `2.0`), prefers strict JSON Schema output, and automatically retries with exponential backoff on HTTP 429 rate limits and 5xx server errors (respecting `Retry-After` headers when provided).

### Gemini native configuration

Select **Gemini (native)** to enable the native request and response format, including:

- Set the four adjustable content filters (harassment, hate speech, sexually explicit, and dangerous content) to `OFF`.
- Send the source strings as JSON and request JSON Schema output, retaining JSON mode if schema support is unavailable.
- Use temperature `1.0` for Gemini 3, as [recommended by Google](https://ai.google.dev/gemini-api/docs/gemini-3#temperature), and minimal thinking for Gemini 3.1 Flash-Lite. Other models keep their configured temperature.

For Google directly, use Base URL `https://generativelanguage.googleapis.com/v1beta` and your Google API key. The script appends `/models/{model}:generateContent` and sends `safetySettings` with `x-goog-api-key` authentication. Native proxies can use their own Base URL. An explicit `/v1` or `/v1beta` is preserved; `/v1beta` is added when neither is present. Google's `/v1beta/openai` URL belongs to Chat Completions and is not rewritten to the native API.

For [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/), select **Gemini (native)** and use Base URL `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/google-ai-studio`. With a [custom domain](https://developers.cloudflare.com/ai-gateway/configuration/custom-domains/), use `https://ai.example.com/google-ai-studio`; omit the account and gateway IDs. Set Model to `gemini-3.1-flash-lite` and API key to your Cloudflare AI Gateway token. The script appends `/v1beta/models/{model}:generateContent` and authenticates with `cf-aig-authorization`. Store your Google key in the gateway (BYOK), or use Unified Billing.

Chat Completions always uses generic parameters and the configured temperature, even for models named `gemini`. It never sends Gemini safety or thinking settings. In native mode, the script never retries by dropping safety settings. `OFF` disables the adjustable filters; [Google's built-in protections remain](https://ai.google.dev/gemini-api/docs/safety-settings).

The selected API format is saved and included in settings exports. Older settings and imports without this field default to Chat Completions; select Gemini (native) explicitly when using a native endpoint.

## Privacy

- API request bodies contain only extracted visible text, lightweight inline-segment markers, the selected model, and the translation instruction. The page HTML, URL, and title are not included. The API provider may still receive normal network metadata such as your IP address.
- API requests use Tampermonkey's `anonymous` mode.
- The script includes no analytics, tracking, or unrelated external requests.
- The API key is entered in a masked field and stored in Tampermonkey storage, not in the userscript source. Use the clear API settings menu command to delete it and the other API settings.
- The cache stores only 64-bit hashes of the settings, source text, and inline layout plus the translation, translated segments, and a timestamp. It never stores the source text and is limited to 500 entries.
- `@connect *` allows custom API domains. The script only connects to the configured Base URL.
- Settings exports omit the API key by default. If included, the key is stored as plain text and the exported JSON must be treated as sensitive.

## Limitations

Browser-protected pages, frames that deny extension access, closed Shadow DOM, Canvas, PDFs, images, and video subtitles remain inaccessible because they do not expose ordinary HTML text to userscripts. Existing inline elements, classes, styles, and colors are preserved when the provider returns the segment markers intact. If it changes those markers, the script safely falls back to plain text without retrying or spending additional quota. New API requests are limited to 6,000 characters per text block. API responses are never inserted as HTML.

## Self-check

```sh
node --check touch-translate.user.js
node test.mjs
```
