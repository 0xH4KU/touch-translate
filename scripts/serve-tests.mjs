import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.argv[2] || 8765);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("Invalid path");
    res.setHeader("Content-Type", `${types[extname(path)] || "text/plain"}; charset=utf-8`);
    res.end(await readFile(path));
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`Browser checks: http://127.0.0.1:${port}/test/browser.html`));
