#!/usr/bin/env node
/**
 * Interface checks: the real index.html in Chromium (Playwright, a dev-only
 * dependency never shipped), with an in-memory `grist` (fakeGrist.mjs). Plain
 * assertions, like the unit tests. Behaviour against a real Grist is in test/grist.
 */

import assert from "node:assert/strict";
import { launchWidget } from "./widgetPage.mjs";
import { fakeGrist } from "./fakeGrist.mjs";
import { analyse, apply, previewRows } from "./driver.mjs";

const MULTI = `import grist

@grist.UserTable
class TableA:
  Name = grist.Text()

@grist.UserTable
class TableB:
  Label = grist.Text()
  Extra = grist.Numeric()
`;

const TYPES = "@grist.UserTable\nclass X:\n  A = grist.Reference('Other_Table')\n  B = grist.Int()\n";

const hidden = (page, id) => page.evaluate((target) => document.getElementById(target).hidden, id);
const count = (page, selector) => page.locator(selector).count();

const TESTS = [
  ["loads without console error nor CSP violation, with its font", async (page) => {
    assert.equal(await page.title(), "Structure de table Grist");
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => [...document.fonts].some((font) => font.family === "Manrope" && font.status === "loaded")));
  }],

  ["Import: several tables show the checklist, not the single dropdown", async (page) => {
    await analyse(page, MULTI);
    assert.equal(await hidden(page, "table-multi-picker-row"), false);
    assert.equal(await hidden(page, "table-picker-row"), true);
    assert.equal(await count(page, "#table-multi-select input[type=checkbox]"), 2);
  }],

  ["Import: unticking a column keeps it out of the AddTable payload", async (page, grist) => {
    await analyse(page, MULTI);
    assert.equal(await count(page, "#columns-preview-body .col-checkbox input"), 3);
    await page.locator("#columns-preview-body tr", { hasText: "Extra" }).locator("input").click();
    await apply(page);
    const [addTables] = grist.calls;
    assert.deepEqual(addTables.map(([, id, columns]) => [id, columns.map((col) => col.id)]), [["TableA", ["Name"]], ["TableB", ["Label"]]]);
  }],

  ["Import: Effacer resets the tab", async (page) => {
    await analyse(page, MULTI);
    await page.click("#clear-btn");
    assert.equal(await page.inputValue("#source-input"), "");
    assert.equal(await hidden(page, "preview-section"), true);
    assert.equal(await hidden(page, "mode-block"), true);
  }],

  ["Import: an existing table gets AddVisibleColumn, never the plain AddColumn", async (page, grist) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  NewCol = grist.Text()\n");
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    await apply(page);
    assert.deepEqual(grist.calls.flat().map(([name]) => name), ["AddVisibleColumn"]);
  }],

  ["Import: the preview names column types in French", async (page) => {
    await analyse(page, TYPES);
    assert.deepEqual(await previewRows(page), ["ARéférence vers « Other_Table »", "BEntier"]);
  }],

  ["Import: the preview names column types in English", async (page) => {
    await analyse(page, TYPES);
    assert.deepEqual(await previewRows(page), ["AReference to “Other_Table”", "BInteger"]);
  }, { locale: "en" }],

  ["Import: a long identifier wraps instead of overflowing a narrow pane", async (page) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await analyse(page, `@grist.UserTable\nclass ${"Very_long_table_name_".repeat(6)}:\n  ${"column_with_a_long_name_".repeat(5)} = grist.Reference('${"Other_".repeat(12)}')\n`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  }],

  ["Import: editing the text drops the preview it no longer matches", async (page) => {
    await analyse(page, MULTI);
    await page.fill("#source-input", "@grist.UserTable\nclass Other:\n  X = grist.Text()\n");
    assert.equal(await hidden(page, "preview-section"), true);
    assert.equal(await page.isDisabled("#action-btn"), true);
  }],

  ["Import: a double click creates once", async (page, grist) => {
    await analyse(page, MULTI);
    await page.dblclick("#action-btn");
    await page.waitForSelector("#import-status-region .status-success");
    assert.equal(grist.calls.length, 1);
  }, { delay: 300 }],

  ["Import: switching language rebuilds the preview, the notes and the button", async (page) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  A = grist.Reference('Ghost')\n");
    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.deepEqual(await previewRows(page), ["AAny"]);
    assert.match(await page.textContent("#warnings-list"), /target table/);
    assert.equal(await page.textContent("#action-btn"), "Create the table in this document");
  }],

  ["Import: toggling a column keeps the keyboard where it was", async (page) => {
    await analyse(page, MULTI);
    await page.locator("#columns-preview-body input").nth(1).press("Space");
    assert.equal(await page.evaluate(() => [...document.querySelectorAll("#columns-preview-body input")].indexOf(document.activeElement)), 1);
  }],

  ["Import: a column already in the table cannot be ticked, and is not counted", async (page) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Name = grist.Text()\n  Fresh = grist.Text()\n");
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await page.locator("#columns-preview-body input:disabled").count(), 1);
    assert.equal(await page.textContent("#action-btn"), "Ajouter 1 colonne à cette table");
  }],

  ["Import: the fields are named, linked to their error, and the result is announced", async (page) => {
    await analyse(page, MULTI);
    assert.equal(await page.getByRole("textbox", { name: "TableA" }).count(), 1);
    await page.getByRole("textbox", { name: "TableB" }).fill("TableA");
    assert.equal(await page.getByRole("textbox", { name: "TableB" }).getAttribute("aria-invalid"), "true");
    const error = await page.getByRole("textbox", { name: "TableB" }).getAttribute("aria-describedby");
    assert.match(await page.textContent(`#${error}`), /plusieurs fois/);
    assert.equal(await page.textContent("#import-announcement"), "Analyse terminée : 2 tables, 3 colonnes au total.");
    assert.equal(await page.getByRole("radiogroup", { name: /Que faire/ }).count(), 1);
  }],

  ["Réglages: the licence links to the licence text, not to a personal account", async (page) => {
    assert.equal(await page.getAttribute('#settings-dialog a[href*="gpl"]', "href"), "https://www.gnu.org/licenses/gpl-3.0.html");
    assert.equal(await page.locator('a[href*="github.com"]').count(), 0);
  }],

  ["Export: the table list loads and the referenced-table banner can include its tables", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await count(page, "#export-table-list input"), 3);
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
    assert.equal(await hidden(page, "export-refs-banner"), false);
    await page.click("#refs-include-btn");
    assert.equal(await hidden(page, "export-refs-banner"), true);
    assert.equal(await count(page, "#export-table-list input:checked"), 2);
  }],

  ["Réglages: opens, persists the theme, switches the language", async (page) => {
    await page.click("#settings-btn");
    assert.equal(await page.evaluate(() => document.getElementById("settings-dialog").open), true);
    await page.click('label.segmented-option:has(input[value="dark"])');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    assert.equal(await page.evaluate(() => localStorage.getItem("gristFactory.theme")), "dark");
    assert.equal(await page.textContent("h1"), "Structure de table");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.equal(await page.textContent("h1"), "Table structure");
    await page.click("#settings-close-btn");
    assert.equal(await page.evaluate(() => document.getElementById("settings-dialog").open), false);
  }],
];

const widget = await launchWidget();
let failed = 0;
for (const [name, check, options] of TESTS) {
  const grist = fakeGrist(options);
  const page = await widget.open(grist, options);
  try {
    await check(page, grist);
    assert.deepEqual(page.problems, [], "console error, page error or CSP violation");
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name}\n  ${err.message}`);
  }
  await page.close();
}
await widget.close();
console.log(`\n${TESTS.length - failed}/${TESTS.length} browser checks passed.`);
process.exitCode = failed > 0 ? 1 : 0;
