import { readFileSync } from "node:fs";
import vm from "node:vm";

export const cacheSettings = { baseURL: "https://api.example.com/v1", model: "m", targetLanguage: "zh-TW" };
export const googleBaseURL = "https://generativelanguage.googleapis.com/v1beta";
export const customGatewayBaseURL = "https://ai.example.com/google-ai-studio";

export function createHarness() {
  const source = readFileSync(new URL("../touch-translate.user.js", import.meta.url), "utf8");
  const imageSource = readFileSync(new URL("../touch-image-translate.user.js", import.meta.url), "utf8");
  const api = {}, imageApi = {}, body = {}, documentElement = {};
  const transport = { options: null, history: [], aborted: false };
  const storage = {};
  const NodeFilter = { FILTER_ACCEPT: 1, FILTER_REJECT: 2, SHOW_TEXT: 4 };
  const document = {
    body, documentElement,
    createTreeWalker(element, _whatToShow, filter) {
      const nodes = (element.textNodes || []).filter(node => filter.acceptNode(node) === NodeFilter.FILTER_ACCEPT);
      let index = -1;
      return { currentNode: null, nextNode() { this.currentNode = nodes[++index]; return Boolean(this.currentNode); } };
    },
  };
  const context = vm.createContext({
    __TOUCH_TRANSLATE_TEST__: api,
    __TOUCH_IMAGE_TRANSLATE_TEST__: imageApi,
    URL, clearTimeout, console, document, NodeFilter, setTimeout,
    GM_info: { script: { version: source.match(/@version\s+(\S+)/)[1] } },
    GM_getValue: (key, fallback) => structuredClone(storage[key] ?? fallback),
    GM_setValue: (key, value) => { storage[key] = structuredClone(value); },
    GM_deleteValue: (key) => { delete storage[key]; },
    GM_xmlhttpRequest: (options) => {
      transport.options = options;
      transport.history.push(options);
      return { abort() { transport.aborted = true; options.onabort?.(); } };
    },
    getComputedStyle: (element) => ({
      contentVisibility: element.contentVisibility, direction: element.direction,
      display: element.display, overflowX: element.overflowX,
      visibility: element.visibility, whiteSpace: element.whiteSpace,
    }),
    matchMedia: () => ({ matches: true }),
  });
  vm.runInContext(source, context);
  vm.runInContext(imageSource, context);
  return { api, imageApi, source, imageSource, context, document, body, documentElement, transport, storage };
}
