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
3. Open the Tampermonkey script menu and run Touch Translate's API setup command.

Example Base URL: `https://api.openai.com/v1`. The script appends `/chat/completions`; you may also enter a complete `/chat/completions` URL. Local and private network HTTP endpoints (e.g. `http://localhost:11434`, `http://127.0.0.1:11434`, `http://192.168.x.x`, or `http://*.local`) are also supported for self-hosted setups (Ollama, LocalAI, vLLM). Custom endpoints must accept OpenAI Chat Completions requests with Bearer authentication. Gemini on Google's official domain automatically uses the native Gemini API as described below.

The script defaults to a sampling `temperature` of `0.2` (customizable between `0.0` and `2.0`), prefers strict JSON Schema output, and automatically retries with exponential backoff on HTTP 429 rate limits and 5xx server errors (respecting `Retry-After` headers when provided).

### Automatic Gemini configuration

Model names containing `gemini` (case-insensitive, including names such as `google/gemini-3.1-flash-lite`) automatically enable Gemini settings. No preset or extra setup step is needed:

- Set the four adjustable content filters (harassment, hate speech, sexually explicit, and dangerous content) to `OFF`.
- Send the source strings as JSON and request JSON Schema output, retaining JSON mode if schema support is unavailable.
- Use temperature `1.0` for Gemini 3, as [recommended by Google](https://ai.google.dev/gemini-api/docs/gemini-3#temperature), and minimal thinking for Gemini 3.1 Flash-Lite. Other models keep their configured temperature.

For `generativelanguage.googleapis.com`, the script automatically uses `/v1beta/models/{model}:generateContent` with `safetySettings` and API-key header authentication. Google's [Chat Completions compatibility interface](https://ai.google.dev/gemini-api/docs/openai) does not document safety settings for text chat, so the native API is used to apply them explicitly. Existing Google Base URLs, including `/v1beta/openai`, continue to work.

Custom Chat Completions gateways receive the `safety_settings` extension, as supported by [LiteLLM](https://docs.litellm.ai/docs/providers/gemini#specifying-safety-settings). The gateway must forward these settings; model-name detection alone cannot guarantee that a gateway honors them. The script never retries by dropping safety settings. `OFF` disables the adjustable filters; [Google's built-in protections remain](https://ai.google.dev/gemini-api/docs/safety-settings). Non-Gemini models receive the original generic request parameters.

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
