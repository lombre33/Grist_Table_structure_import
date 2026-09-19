#!/usr/bin/env node
/**
 * Automated browser regression test for the widget's actual UI/DOM
 * behavior — the parts test/*.test.mjs (pure parsing/generation/schema
 * logic) cannot reach, since they run outside a browser with no DOM.
 *
 * Exists because index.html and test/browser/harness.html duplicate their
 * markup by hand (no build step, no templating — see README.md/SECURITY.md's
 * zero-runtime-dependency posture) and drifted out of sync silently more
 * than once during development, breaking the Import tab in a way `npm test`
 * alone could not catch. This is the automated safety net for that: it
 * serves this repo statically on a local port and drives harness.html (a
 * stubbed `window.grist`, see that file) with Playwright, a devDependency
 * used only here, in CI and local development — never shipped to the
 * published widget (see .github/workflows/pages.yml's file list).
 *
 * Plain assertions (`node:assert/strict`), no test framework, matching
 * test/*.test.mjs's own style: one mental model for "how this project
 * tests things", browser or not.
 */

import { chromium } from "playwright";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const PORT = 8934;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const HARNESS_URL = `${BASE_URL}/test/browser/harness.html`;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      // Chromium auto-probes this regardless of whether the page declares a
      // favicon <link> (harness.html does, since it mirrors index.html —
      // some Chromium versions still probe it as a fallback). A plain 204
      // here keeps this an intentional no-op instead of noisy 404 spam that
      // a real console.error assertion below would otherwise have to
      // specifically know to ignore.
      if (urlPath === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const filePath = normalize(join(ROOT, urlPath));
      if (!filePath.startsWith(ROOT)) throw new Error("path escapes repo root");
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

/** Fresh page per test: simplest way to avoid state leaking between checks. */
async function withPage(browser, url, fn) {
  const page = await browser.newPage();
  const pageErrors = [];
  const cspViolations = [];
  const otherConsoleErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (/Content Security Policy/i.test(text)) cspViolations.push(text);
    else otherConsoleErrors.push(text);
  });
  await page.goto(url);
  await page.waitForTimeout(200);
  try {
    await fn(page);
  } finally {
    assert.deepEqual(pageErrors, [], "unexpected uncaught page error(s)");
    assert.deepEqual(cspViolations, [], "unexpected CSP violation(s)");
    assert.deepEqual(otherConsoleErrors, [], "unexpected console.error(s)");
    await page.close();
  }
}

const SAMPLE_MULTI = `import grist

@grist.UserTable
class TableA:
  Name = grist.Text()

@grist.UserTable
class TableB:
  Label = grist.Text()
  Extra = grist.Numeric()
`;

const TESTS = [
  {
    name: "loads with no console/page errors and no CSP violations",
    async fn(page) {
      assert.equal(await page.title(), "Structure de table Grist");
    },
  },

  {
    name: "Manrope font actually loads (not blocked by CSP)",
    async fn(page) {
      await page.evaluate(() => document.fonts.ready);
      const loaded = await page.evaluate(() => Array.from(document.fonts).some((f) => f.family === "Manrope" && f.status === "loaded"));
      assert.ok(loaded, "Manrope should report status 'loaded'");
    },
  },

  {
    name: "Import: multi-table paste shows the multi-select checklist, not the single dropdown",
    async fn(page) {
      await page.fill("#source-input", SAMPLE_MULTI);
      await page.click("#analyze-btn");
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.getElementById("table-multi-picker-row").hidden), false);
      assert.equal(await page.evaluate(() => document.getElementById("table-picker-row").hidden), true);
      assert.equal(await page.evaluate(() => document.querySelectorAll("#table-multi-select input[type=checkbox]").length), 2);
    },
  },

  {
    name: "Import: per-column checkbox excludes a column from the AddTable payload",
    async fn(page) {
      await page.fill("#source-input", SAMPLE_MULTI);
      await page.click("#analyze-btn");
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.querySelectorAll("#columns-preview-body .col-checkbox input").length), 3);

      await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("#columns-preview-body tr:not(.table-separator)"));
        rows.find((r) => r.children[1].textContent === "Extra").querySelector(".col-checkbox input").click();
      });
      await page.waitForTimeout(100);
      await page.click("#action-btn");
      await page.waitForTimeout(200);

      const payload = await page.evaluate(() => {
        const calls = window.__harness.actionCalls.filter((c) => c[0] && c[0][0] === "AddTable");
        return calls[calls.length - 1].map((action) => [action[1], action[2].map((c) => c.id)]);
      });
      assert.deepEqual(payload, [
        ["TableA", ["Name"]],
        ["TableB", ["Label"]],
      ]);
    },
  },

  {
    name: "Import: Effacer resets the tab to its pristine state",
    async fn(page) {
      await page.fill("#source-input", SAMPLE_MULTI);
      await page.click("#analyze-btn");
      await page.waitForTimeout(200);
      await page.click("#clear-btn");
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.getElementById("source-input").value), "");
      assert.equal(await page.evaluate(() => document.getElementById("preview-section").hidden), true);
      assert.equal(await page.evaluate(() => document.getElementById("mode-block").hidden), true);
    },
  },

  {
    name: "Import: 'Table existante' mode uses AddVisibleColumn, not the plainer AddColumn",
    async fn(page) {
      await page.fill("#source-input", "@grist.UserTable\nclass X:\n  NewCol = grist.Text()\n");
      await page.click("#analyze-btn");
      await page.waitForTimeout(200);
      await page.click('label.mode-card:has(input[value="existing"])');
      await page.waitForTimeout(200);
      await page.selectOption("#target-table-select", { label: "Existing_Table" });
      await page.waitForTimeout(200);
      await page.click("#action-btn");
      await page.waitForTimeout(200);
      const actionNames = await page.evaluate(() =>
        window.__harness.actionCalls.flat().filter((a) => a[0] === "AddColumn" || a[0] === "AddVisibleColumn").map((a) => a[0])
      );
      assert.ok(actionNames.includes("AddVisibleColumn"));
      assert.ok(!actionNames.includes("AddColumn"));
    },
  },

  {
    name: "Export: table list loads and the referenced-table banner appears/can be included",
    async fn(page) {
      await page.click("#tab-export");
      await page.waitForTimeout(200);
      await page.click("#refresh-tables-btn");
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => document.querySelectorAll("#export-table-list input[type=checkbox]").length), 3);

      await page.evaluate(() => {
        const cb = Array.from(document.querySelectorAll("#export-table-list li")).find((li) => li.textContent.includes("Existing_Table"));
        cb.querySelector("input").click();
      });
      await page.evaluate(() => document.getElementById("export-table-list").dispatchEvent(new Event("change", { bubbles: true })));
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.getElementById("export-refs-banner").hidden), false);

      await page.click("#refs-include-btn");
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.getElementById("export-refs-banner").hidden), true);
      assert.equal(
        await page.evaluate(() => Array.from(document.querySelectorAll("#export-table-list input:checked")).length),
        2
      );
    },
  },

  {
    name: "Réglages: dialog opens/closes, theme persists, locale switches visible text",
    async fn(page) {
      await page.click("#settings-btn");
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.getElementById("settings-dialog").open), true);

      await page.click('label.segmented-option:has(input[value="dark"])');
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme")), "dark");
      assert.equal(await page.evaluate(() => localStorage.getItem("gristFactory.theme")), "dark");

      assert.equal(await page.evaluate(() => document.querySelector("h1").textContent), "Structure de table");
      await page.click('label.segmented-option:has(input[value="en"])');
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.querySelector("h1").textContent), "Table structure");

      await page.click("#settings-close-btn");
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => document.getElementById("settings-dialog").open), false);
    },
  },
];

async function main() {
  const server = await startServer();
  // Unset in CI (a fresh `npx playwright install chromium` there puts the
  // browser exactly where this same `playwright` package version expects
  // it by default). Local escape hatch only, for a dev machine whose
  // Playwright browser cache lives somewhere non-standard.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath });
  let failed = 0;

  for (const { name, fn } of TESTS) {
    try {
      await withPage(browser, HARNESS_URL, fn);
      console.log(`ok - ${name}`);
    } catch (err) {
      failed++;
      console.error(`not ok - ${name}`);
      console.error(`  ${err.message}`);
    }
  }

  await browser.close();
  server.close();

  console.log(`\n${TESTS.length - failed}/${TESTS.length} browser checks passed.`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
