# Touch Translate

A private bilingual translation userscript built for iOS Safari and Tampermonkey. It keeps the original DOM intact and inserts a lightly de-emphasized translation below each source block using the same tag and classes.

[Install Touch Translate with Tampermonkey](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js)

## Usage

- Swipe right at least 60px on a text block. A progress ring follows the gesture, then the script translates `p`, `li`, `blockquote`, or `h1`-`h6` elements.
- Swipe the same block again while it is loading to cancel. Swipe again after the translation appears to remove it.
- Quickly tap with four fingers to translate the main page content in batches, starting with the current viewport.
- Use the Tampermonkey menu to configure the API, translate the page, import or export settings, and clear the cache.

Swipes starting within 30px of the left screen edge are ignored to avoid triggering Safari's back gesture.

Page translation skips navigation, forms, page headers and footers, plain URLs, and short blocks dominated by links. Repeated text is sent to the API once and the resulting translation is reused, reducing unnecessary API usage. Manual swipes bypass these content filters so you remain in control.

## Installation

1. Install and enable Tampermonkey in Safari.
2. Open the [direct install link](https://raw.githubusercontent.com/0xH4KU/touch-translate/main/touch-translate.user.js) and confirm the installation in Tampermonkey.
3. Open the Tampermonkey script menu and run Touch Translate's API setup command.

Example Base URL: `https://api.openai.com/v1`. The script appends `/chat/completions`; you may also enter a complete `/chat/completions` URL.

## Privacy

- API request bodies contain only extracted plain text, the selected model, and the translation instruction. The page HTML, URL, and title are not included. The API provider may still receive normal network metadata such as your IP address.
- API requests use Tampermonkey's `anonymous` mode.
- The script includes no analytics, tracking, or unrelated external requests.
- The API key is stored in Tampermonkey storage, not in the userscript source.
- The cache stores only a 64-bit hash of the settings and source text, the translation, and a timestamp. It never stores the source text and is limited to 500 entries.
- `@connect *` allows custom API domains. The script only connects to the configured Base URL.
- Settings exports omit the API key by default. If included, the key is stored as plain text and the exported JSON must be treated as sensitive.

## Limitations

The script does not handle iframes, Shadow DOM, Canvas, PDFs, video subtitles, or word-level HTML formatting. Translations are inserted as plain text to prevent API responses from injecting markup into the page.

## Self-check

```sh
node --check touch-translate.user.js
node test.mjs
```
