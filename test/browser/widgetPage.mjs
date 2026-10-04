/**
 * Opens the real index.html in Chromium with a `window.grist` whose `docApi`
 * is implemented on the Node side: an in-memory fake for interface tests, or a
 * real Grist document (test/grist/client.mjs).
 */

import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function serveRepository() {
  const server = http.createServer(async (req, res) => {
    try {
      const filePath = normalize(join(ROOT, decodeURIComponent(req.url.split("?")[0])));
      if (!filePath.startsWith(ROOT)) throw new Error("outside the repository");
      res.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream" });
      res.end(await readFile(filePath));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/** Browser + static server: `open(grist)` returns a loaded page, `close()` releases both. */
export async function launchWidget() {
  const server = await serveRepository();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const pages = [];

  /** `bypassCSP` is for tests that inject a script of their own (axe-core): the CSP is checked by the others. */
  async function open(grist, { locale, bypassCSP } = {}) {
    const page = await browser.newPage({ bypassCSP });
    if (process.env.WIDGET_TEST_TIMEOUT) page.setDefaultTimeout(Number(process.env.WIDGET_TEST_TIMEOUT)); // a shorter wait while the tests are being written: what is not there is not coming
    page.problems = [];
    page.on("pageerror", (err) => page.problems.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => msg.type() === "error" && page.problems.push(`console: ${msg.text()}`));
    await page.route("https://docs.getgrist.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
    await page.exposeFunction("__gristCall", (method, args) => grist.docApi[method](...args));
    await page.addInitScript((initialLocale) => {
      window.grist = {
        ready() {},
        docApi: new Proxy({}, { get: (_, method) => (...args) => window.__gristCall(method, args) }),
      };
      if (initialLocale) localStorage.setItem("gristFactory.locale", initialLocale);
    }, locale);
    await page.goto(url);
    pages.push(page);
    return page;
  }

  return {
    open,
    url,
    browser,
    async close() {
      await browser.close();
      server.close();
    },
  };
}
