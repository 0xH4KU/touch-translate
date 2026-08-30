# Touch Translate

A private, touch-first bilingual translation userscript for iOS Safari and Tampermonkey. It keeps the source DOM intact, preserves safe inline formatting and colors, and inserts each translation as a clearly separated block below the original.

[Install Touch Translate with Tampermonkey](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js)

## Usage

- Swipe right at least 60px on a visible HTML text block. A progress ring follows above your finger without shifting the text, a short confirmation beat commits it, and then a compact activity indicator remains at that reading position while the script translates it.
- Swipe the same block again while it is loading to cancel. The network request is also aborted when no other block shares it. Swipe again after the translation appears to remove it.
- Tap a red error indicator to view the translation provider's original error message.
- Quickly tap with four fingers to translate the main page content in batches, starting with a small batch in the current viewport. Repeat the gesture to stop the remaining page translation.
- Use the Tampermonkey menu to configure the API, translate the page, import or export settings, and clear the cache.

Swipes starting within 30px of the left screen edge are ignored to avoid triggering Safari's back gesture. Native horizontal scrolling takes priority inside scrollable tables and other horizontal regions. Container gaps that would select multiple nested text blocks are ignored.

The userscript is enabled on all regular websites, including frames where Tampermonkey can inject and open Shadow DOM content. Browser-protected pages such as Safari settings, extension stores, and other internal URLs do not allow userscripts to run.

Page translation skips navigation, forms, page headers and footers, plain URLs, and short blocks dominated by links. Repeated text is sent to the API once and the resulting translation is reused, reducing unnecessary API usage. Manual swipes bypass these content filters so you remain in control.

## Installation

1. Install and enable Tampermonkey in Safari.
2. Open the [direct install link](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js) and confirm the installation in Tampermonkey.
3. Open the Tampermonkey script menu and run Touch Translate's API setup command.

Example Base URL: `https://api.openai.com/v1`. The script appends `/chat/completions`; you may also enter a complete `/chat/completions` URL.

## Privacy

- API request bodies contain only extracted text, lightweight inline-segment markers, the selected model, and the translation instruction. The page HTML, URL, and title are not included. The API provider may still receive normal network metadata such as your IP address.
- API requests use Tampermonkey's `anonymous` mode.
- The script includes no analytics, tracking, or unrelated external requests.
- The API key is stored in Tampermonkey storage, not in the userscript source.
- The cache stores only 64-bit hashes of the settings, source text, and inline layout plus the translation, translated segments, and a timestamp. It never stores the source text and is limited to 500 entries.
- `@connect *` allows custom API domains. The script only connects to the configured Base URL.
- Settings exports omit the API key by default. If included, the key is stored as plain text and the exported JSON must be treated as sensitive.

## Limitations

Browser-protected pages, frames that deny extension access, closed Shadow DOM, Canvas, PDFs, images, and video subtitles remain inaccessible because they do not expose ordinary HTML text to userscripts. Existing inline elements, classes, styles, and colors are preserved when the provider returns the segment markers intact. If it changes those markers, the script safely falls back to plain text without retrying or spending additional quota. API responses are never inserted as HTML.

## Self-check

```sh
node --check touch-translate.user.js
node test.mjs
```
