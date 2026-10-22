# Touch Translate

A private, touch-first bilingual translation userscript suite for iOS Safari and Tampermonkey:

- **[Touch Translate (`touch-translate.user.js`)](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js)** — Pure text translation via right-swipe on paragraphs and four-finger tap for full-page translation. Keeps the source DOM intact and inserts each translation as a clearly separated block below the original.
- **[Touch Image Translate (`touch-image-translate.user.js`)](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-image-translate.user.js)** — Standalone Babel Lens image translation userscript triggered by a two-finger right-swipe on an image, featuring dense macro-block merging, Spotlight Mode, and a full-screen zoomable lightbox viewer.

## Text Translation (`touch-translate.user.js`)

- Swipe right on a visible HTML text block. A 60px drag or a shorter deliberate flick commits it; initial finger drift and a small release correction are tolerated once the rightward gesture is clear.
- Swipe the same block again while it is loading to cancel. The network request is also aborted when no other block shares it. Swipe again after the translation appears to remove it.
- Quickly tap with four fingers to start automatic page translation. Modern `IntersectionObserver` scheduling observes translatable content and translates visible blocks with prefetching as you scroll, avoiding layout thrashing. Repeat the gesture to stop and remove the translations added by that automatic run.
- Translation errors open a dialog with the provider or response-format details. HTTP errors also show the API format, script version, request and response URLs, and Cloudflare request identifiers when available; diagnostic URLs omit credentials and query parameters. Retry the failed blocks from the dialog or close it and leave the red status indicator in place.
- Use the Tampermonkey menu to configure or clear the API settings, translate the page, import or export settings, and clear the cache.

Text blocks are translated with their paragraphs and line breaks intact, rather than sending each line as a separate translation item. The prompt uses related blocks for terminology and references while keeping each result in its original slot. A response that loses paragraph or line breaks is rejected instead of silently flattening the text.

Swipes starting within 12px of the left screen edge are ignored to avoid triggering Safari's back gesture. Native horizontal scrolling takes priority while a scrollable table or other horizontal region can move with the gesture; a right swipe at its leading edge translates normally. Container gaps that would select multiple nested text blocks are ignored.

Page translation skips navigation, forms, page headers and footers, plain URLs, and short blocks dominated by links. Repeated text is sent to the API once and the resulting translation is reused, reducing unnecessary API usage. Manual swipes bypass these content filters so you remain in control.

YouTube comment text is recognized on both desktop and mobile pages, including mobile comments wrapped in buttons. Open the comments panel first; automatic translation picks up newly loaded comments and replies. Desktop translations appear below the comment expander so they are not clipped by “Show more”.

## Image Translation (`touch-image-translate.user.js`)

- **Two-Finger Right-Swipe on an Image**: Swipe right with two fingers on any content image (`>= 120×90px`) to translate visible text in the image without conflicting with single-finger social media image carousels. Idle images have **zero floating buttons**, keeping your view completely unobstructed while browsing. Transparent links within the same image card work even when the image itself cannot receive touches; opaque notices and text overlays are ignored.
- **Macro-Block Merging**: Dense text (paragraphs, consecutive list items, speech bubbles, UI panels, or multi-line sections) is grouped into coarse logical regions with internal line breaks (`\n`) rather than boxing individual lines.
- **Full-Screen Zoomable Viewer**: When translation completes, a dedicated full-screen viewer opens automatically. Pinch to zoom (`1x`–`5x`), drag to pan, or double-tap to zoom (`1x` ↔ `2.4x`). Closing the viewer returns immediately to your exact reading position on the page; swiping right with two fingers on the image again (or tapping its `done` badge) re-opens the viewer from cache without re-requesting the API.
- **Spotlight Mode & Floating Sheet**: Unselected regions show only compact numbered badges (`1`, `2`, ...) with no bounding box clutter. Only the active region illuminates its full amber bounding box (`#f59e0b`) and displays its translation in the bottom floating card, with `Prev` / `Next` navigation, an `All (N)` expandable list of all regions, and a `Hide pins` toggle to inspect the raw image.

Region pins keep a readable size and a 44px touch area while zooming, and follow the displayed image when the screen rotates.

When multiple images are loading, only the most recent image action can open the viewer automatically. Other completed results remain available from their image badges. Gestures inside either plugin's controls are excluded from page translation gestures.

## Installation

1. Install and enable Tampermonkey in Safari.
2. Open the direct install link for [Touch Translate](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js) and/or [Touch Image Translate](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-image-translate.user.js) and confirm the installation in Tampermonkey.
3. Open the Tampermonkey script menu and run the API setup command. Choose **Chat Completions** (default) or **Gemini (native)** under API format.

For Chat Completions, use a Base URL such as `https://api.openai.com/v1`. The script appends `/chat/completions`; you may also enter a complete `/chat/completions` URL. Local and private network HTTP endpoints (e.g. `http://localhost:11434`, `http://127.0.0.1:11434`, `http://192.168.x.x`, or `http://*.local`) are also supported for self-hosted setups (Ollama, LocalAI, vLLM). Requests use Bearer authentication. Model names and domains never switch the selected API format.

The scripts prefer strict JSON Schema output and automatically retry with exponential backoff on HTTP 429 rate limits and 5xx server errors, respecting `Retry-After` when provided. Quota and billing errors stop immediately. Sampling defaults to `temperature: 0.2` (customizable between `0.0` and `2.0`) except for Gemini 3.5 Flash-Lite in native mode, which uses the model's default sampling.

Image translation requires a model that accepts image input. Images are resized to a maximum edge of 1,600 pixels and normalized to PNG to preserve transparency. Changing an image's source cancels its pending request and clears its previous translation.

For Gemini native image requests, `touch-image-translate.user.js` uses a small output schema and validates region bounds locally. If the API returns HTTP 400 `INVALID_ARGUMENT`, it retries once in JSON mode without the output schema.

### Gemini native configuration

Select **Gemini (native)** to enable the native request and response format, including:

- Set the five adjustable content filters (harassment, hate speech, sexually explicit, dangerous content, and civic integrity) to `OFF`.
- Send the source strings as JSON and request JSON Schema output, retaining JSON mode if schema support is unavailable.
- Use minimal thinking for Gemini 3.1 Flash-Lite while respecting your configured temperature.
- Use **medium thinking for `gemini-3.5-flash-lite`**, favoring translation quality over its default minimal effort. Omit its deprecated temperature override; the settings dialog explains this and preserves the saved temperature for other models. Medium thinking can use more tokens and take longer. See Google's [model parameter guidance](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.6).

For Gemini 3.5 Flash-Lite, select **Gemini (native)** and set Model to `gemini-3.5-flash-lite`. Both plugins use shared instructions for natural phrasing, regional language usage, consistent terminology, and faithful handling of negation, tone, names, numbers, and code. Image translation also reads the whole scene for context and keeps different speakers and panels separate. Thought parts are excluded from the answer; blocked or incomplete responses are reported without treating them as successful translations.

For Google directly, use Base URL `https://generativelanguage.googleapis.com/v1beta` and your Google API key. The script appends `/models/{model}:generateContent` and sends `safetySettings` with `x-goog-api-key` authentication. Native proxies can use their own Base URL. An explicit `/v1` or `/v1beta` is preserved; `/v1beta` is added when neither is present. Google's `/v1beta/openai` URL belongs to Chat Completions and is not rewritten to the native API.

For [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/usage/providers/google-ai-studio/), select **Gemini (native)** and use Base URL `https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/google-ai-studio`. With a [custom domain](https://developers.cloudflare.com/ai-gateway/configuration/custom-domains/), use `https://ai.example.com/google-ai-studio`; omit the account and gateway IDs. Do not insert `/compat` before `/google-ai-studio`; native mode rejects this mixed route. Set Model to `gemini-3.5-flash-lite` and API key to your Cloudflare AI Gateway token. The script appends `/v1beta/models/{model}:generateContent` and authenticates with `cf-aig-authorization`. Store your Google key in the gateway (BYOK), or use Unified Billing.

Chat Completions always uses generic parameters and the configured temperature, even for models named `gemini`. It never sends Gemini safety or thinking settings. In native mode, the script never retries by dropping safety settings. `OFF` disables the adjustable filters; [Google's built-in protections remain](https://ai.google.dev/gemini-api/docs/safety-settings).

The selected API format is saved and included in settings exports. Older settings and imports without this field default to Chat Completions; select Gemini (native) explicitly when using a native endpoint.

The two plugins keep separate settings so text and image models can differ. Both accept the same versioned export or a flat settings object. Importing another provider endpoint or API format without an API key clears the previous key; enter the new provider's key separately.

## Privacy

- API request bodies contain only extracted visible plain text (or the normalized image when you explicitly swipe right on an image), the selected model, and the translation instruction. The page HTML, URL, and title are not included. The API provider may still receive normal network metadata such as your IP address.
- API requests use Tampermonkey's `anonymous` mode.
- Provider error diagnostics omit URL credentials, query strings, and fragments, and redact the configured API key before displaying or logging them.
- The scripts include no analytics, tracking, or unrelated external requests.
- The API key is entered in a masked field and stored in Tampermonkey storage, not in the userscript source. Use the clear API settings menu command to delete it and the other API settings.
- The cache stores only 64-bit hashes of the settings and source text or image URL plus the translation and a timestamp. It never stores the source text.
- `@connect *` allows custom API domains and cross-origin image fetching when you trigger image translation.
- Settings exports omit the API key by default in both plugins.

## Limitations

Browser-protected pages, frames that deny extension access, closed Shadow DOM, Canvas, PDFs, and video subtitles remain inaccessible because they do not expose ordinary HTML text to userscripts. New API requests are limited to 6,000 characters per text block and 10 MB per image. API responses are never inserted as HTML.

## Development and self-check

The root `.user.js` files are generated install artifacts. Edit `src/` and rebuild; do not edit the generated files directly. No package installation or external runtime dependency is needed.

- `src/shared/`: settings, provider transport and diagnostics, cache, gesture helpers, notifications and common styles.
- `src/text/` and `src/image/`: matching `config`, `content`, `translation`, `jobs`, `gestures`, `styles`, and `index` files. Image translation adds `viewer.js`.
- `test/`: separate text, image and shared regression suites. `test.mjs` remains the entry point.

Build after source changes:

```sh
node scripts/build.mjs
```

Check that the install artifacts match their source, validate syntax, and run the regression checks:

```sh
node scripts/build.mjs --check
node --check touch-translate.user.js
node --check touch-image-translate.user.js
node test.mjs
```

For real DOM and gesture integration checks, run `node scripts/serve-tests.mjs` and open [the local browser fixture](http://127.0.0.1:8765/test/browser.html). It loads both complete userscripts with separate mock GM stores and synthetic responses, covering normal initialization, concurrent cache writes, viewer ordering, gesture isolation, settings and automatic page translation. It uses no API keys or paid requests. Safari touch behavior and translation quality on real model output still require device and provider checks.

Prompt and generation-profile changes use new cache keys, so previously cached translations are refreshed when requested again.
