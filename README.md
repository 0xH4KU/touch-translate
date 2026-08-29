# Touch Translate

適合 iOS Safari + Tampermonkey 的私人雙語翻譯 userscript。原文 DOM 不會被替換；譯文使用相同標籤與 class 插在原文下方，再套用較低透明度的 weaken 效果。

## 使用方式

- 在文字段落上向右滑至少 60px：翻譯 `p`、`li`、`blockquote` 或 `h1`–`h6`。
- 在同一段再次向右滑：移除該段譯文。
- 四指快速點擊頁面：分批翻譯目前頁面的文字區塊。
- Tampermonkey 選單提供 API 設定、整頁翻譯、設定匯出/匯入與清除快取。

為避免觸發 Safari 返回上一頁，從螢幕左側 30px 內開始的滑動不會處理。

## 安裝

1. 在 Tampermonkey 建立新腳本。
2. 將 `touch-translate.user.js` 的內容貼入並儲存。
3. 在 Tampermonkey 的腳本選單執行「Touch Translate：設定 API」。

Base URL 範例：`https://api.openai.com/v1`。腳本會呼叫其 `/chat/completions`；也可直接填入完整的 `/chat/completions` URL。

## 隱私

- API request body 只包含抽出的純文字、模型與翻譯指令，不主動加入頁面 HTML、URL 或標題；API 供應商仍會看到 IP 等一般網路中繼資料。
- API 請求使用 Tampermonkey `anonymous` 模式。
- 腳本沒有分析、追蹤或其他外部請求。
- API Key 儲存在 Tampermonkey storage，不寫入 userscript 原始碼。
- 快取只保存設定/原文的 64-bit 雜湊、譯文與時間，不保存原文；最多 500 筆。
- `@connect *` 是為了支援任意自訂 API 網域。腳本本身只會連線到設定的 Base URL。
- 匯出設定預設不包含 API Key；選擇包含時，JSON 會以明文保存，應視為敏感檔案。

## 限制

第一版不處理 iframe、Shadow DOM、Canvas、PDF、影片字幕或原文內的逐字 HTML 格式映射。譯文是純文字，避免 API 回傳內容注入網頁。

## 自檢

```sh
node --check touch-translate.user.js
node test.mjs
```
