# Touch Translate

A private, touch-first bilingual translation userscript for iOS Safari and Tampermonkey. It keeps the source DOM intact, preserves safe inline formatting and colors, and inserts each translation as a clearly separated block below the original.

[Install Touch Translate with Tampermonkey](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js)

## Usage

- Swipe right on a visible HTML text block. A 60px drag or a shorter deliberate flick commits it; initial finger drift and a small release correction are tolerated once the rightward gesture is clear.
- Swipe the same block again while it is loading to cancel. The network request is also aborted when no other block shares it. Swipe again after the translation appears to remove it.
- Translation errors open a dialog with the provider or response-format details. Retry the failed blocks from the dialog or close it and leave the red status indicator in place.
- Quickly tap with four fingers to start automatic page translation. The current and nearby content is translated first, then newly revealed or loaded blocks continue automatically as you scroll. Repeat the gesture to stop and remove the translations added by that automatic run.
- Use the Tampermonkey menu to configure or clear the API settings, translate the page, import or export settings, and clear the cache.

Swipes starting within 30px of the left screen edge are ignored to avoid triggering Safari's back gesture. Native horizontal scrolling takes priority inside scrollable tables and other horizontal regions. Container gaps that would select multiple nested text blocks are ignored.

The userscript is enabled on all regular websites, including frames where Tampermonkey can inject and open Shadow DOM content. Browser-protected pages such as Safari settings, extension stores, and other internal URLs do not allow userscripts to run.

Page translation skips navigation, forms, page headers and footers, plain URLs, and short blocks dominated by links. Repeated text is sent to the API once and the resulting translation is reused, reducing unnecessary API usage. Manual swipes bypass these content filters so you remain in control.

## Installation

1. Install and enable Tampermonkey in Safari.
2. Open the [direct install link](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js) and confirm the installation in Tampermonkey.
3. Open the Tampermonkey script menu and run Touch Translate's API setup command.

Example Base URL: `https://api.openai.com/v1`. The script appends `/chat/completions`; you may also enter a complete `/chat/completions` URL. The endpoint must accept OpenAI Chat Completions requests with Bearer authentication. The script prefers strict JSON Schema output and retries without `response_format` for the current Base URL and model when the provider explicitly reports that structured output is unsupported.

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
