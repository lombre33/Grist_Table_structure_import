/**
 * Interface checks: the real index.html in Chromium (Playwright, a dev-only
 * dependency never shipped), with an in-memory `grist` (fakeGrist.mjs), each check
 * on a fresh page. Behaviour against a real Grist is in test/grist.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { launchWidget } from "./widgetPage.mjs";
import { fakeGrist } from "./fakeGrist.mjs";
import { analyse, apply, previewRows, textOf, warnings } from "./driver.mjs";
import { violations } from "./a11y.mjs";

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

const WITH_FORMULA = "@grist.UserTable\nclass X:\n  A = grist.Int()\n\n  @grist.formulaType(grist.Int())\n  def Double(rec, table):\n    return rec.A * 2\n";

const RICH_SOURCE = (() => {
  const twoWay = "@grist.UserTable\nclass Pets:\n  Owner = grist.Reference('People', reverse_of='Pets')\n\n@grist.UserTable\nclass People:\n  Pets = grist.ReferenceList('Pets', reverse_of='Owner')\n";
  const formula = "\n@grist.UserTable\nclass X:\n  A = grist.Int()\n\n  @grist.formulaType(grist.Int())\n  def Double(rec, table):\n    return rec.A * 2\n";
  return twoWay + formula;
})();

const TWO_WAY =
  "@grist.UserTable\nclass Pets:\n  Owner = grist.Reference('People', reverse_of='Pets')\n\n@grist.UserTable\nclass People:\n  Pets = grist.ReferenceList('Pets', reverse_of='Owner')\n";

/** A check that the notes, the id error and the success message of the Import tab say what they are about. */
const ids = (expected) => async (page) => {
  await analyse(page, "@grist.UserTable\nclass Fresh:\n  id = grist.Int()\n  Title = grist.Text()\n  title = grist.Text()\n");
  assert.deepEqual(await warnings(page), expected.notes);
  assert.equal(await apply(page), expected.created);
  await analyse(page, "@grist.UserTable\nclass Existing_Table:\n  Name = grist.Text()\n");
  assert.equal(await textOf(page, "#table-ids-list .field-error"), expected.exists);
};

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

  ["Import: the messages name the columns and tables they are about, in French", ids({
    notes: ["Ligne 3 : colonne « id » ignorée (identifiant réservé, déjà géré par Grist).", "Ligne 5 : colonne « title » en double (Grist ignore la casse des identifiants), ignorée."],
    exists: "Une table « Existing_Table » existe déjà dans ce document. Choisissez un autre identifiant.",
    created: "Table « Fresh » créée avec 1 colonne.",
  })],

  ["Import: the messages name the columns and tables they are about, in English", ids({
    notes: ["Line 3: column “id” ignored (reserved identifier, already handled by Grist).", "Line 5: duplicate column “title” (Grist ignores the case of identifiers), ignored."],
    exists: "A table “Existing_Table” already exists in this document. Choose another identifier.",
    created: "Table “Fresh” created with 1 column.",
  }), { locale: "en" }],

  ["Language: a saved language the widget does not have is ignored, whatever its name", async (page) => {
    assert.deepEqual(await page.evaluate(() => [document.documentElement.lang, document.querySelector("h1").textContent]), ["fr", "Structure de table"]);
  }, { locale: "constructor" }],

  ["Import: a long identifier wraps instead of overflowing a narrow pane", async (page) => {
    await page.setViewportSize({ width: 320, height: 640 });
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
    assert.equal(await textOf(page, "#action-btn"), "Ajouter 1 colonne à « Existing_Table »", "the button names what it will change");
  }],

  ["Import: one box in the table's head takes all the columns in or out, and what is left out is dimmed", async (page) => {
    await analyse(page, MULTI);
    const state = () => page.evaluate(() => {
      const box = document.getElementById("columns-select-all");
      return [box.checked, box.indeterminate, document.querySelectorAll("#columns-preview-body tr.is-excluded").length];
    });
    assert.deepEqual(await state(), [true, false, 0]);

    await page.locator("#columns-preview-body tr", { hasText: "Extra" }).locator("input").click();
    assert.deepEqual(await state(), [false, true, 1]);

    await page.click("#columns-select-all");
    assert.deepEqual(await state(), [true, false, 0], "from some, it takes all in");
    assert.equal(await page.isDisabled("#action-btn"), false);

    await page.click("#columns-select-all");
    assert.deepEqual(await state(), [false, false, 3], "from all, it takes all out");
    assert.equal(await page.textContent("#action-btn"), "Aucune colonne à créer");
    assert.equal(await page.isDisabled("#action-btn"), true);
  }],

  ["Import: a table renamed still shows which table of the code it comes from, and unticking every table says what to do", async (page) => {
    await analyse(page, MULTI);
    await page.getByRole("textbox", { name: "TableB" }).fill("Beta");
    assert.deepEqual((await previewRows(page)).filter((row) => /^(TableA|Beta)/.test(row) && !row.includes("Texte")), ["TableA", "Beta depuis TableB"]);

    await page.locator("#table-multi-select input").nth(0).uncheck();
    await page.locator("#table-multi-select input").nth(1).uncheck();
    assert.equal(await page.textContent("#action-btn"), "Cochez au moins une table");
    assert.equal(await page.isDisabled("#action-btn"), true);
  }],

  ["Import: a text without any table gets a result of its own, not a step 3 with nothing to verify", async (page) => {
    await analyse(page, "print('hello')");
    assert.equal(await page.textContent("#preview-heading"), "Résultat de l’analyse");
    assert.equal(await hidden(page, "table-id-row"), true);
    assert.equal(await hidden(page, "columns-preview"), true);
    assert.match(await page.textContent("#warnings-list"), /Aucune table trouvée/);
  }],

  ["Import: formulas are offered only when there are some, off by default, and sent only once ticked", async (page, grist) => {
    await analyse(page, TYPES);
    assert.equal(await hidden(page, "formulas-row"), true);

    await analyse(page, WITH_FORMULA);
    assert.equal(await hidden(page, "formulas-row"), false);
    assert.equal(await page.getByRole("checkbox", { name: /formule de 1 colonne/ }).isChecked(), false);
    assert.match(await textOf(page, "#warnings-list"), /créées vides : Double/);
    assert.deepEqual(await previewRows(page), ["AEntier", "DoubleEntier formule"]);

    await page.check("#with-formulas");
    assert.equal(await hidden(page, "warnings-block"), true, "nothing is lost, so nothing is said");
    await apply(page);
    const [[, , columns]] = grist.calls[0];
    assert.deepEqual(columns.map((col) => [col.id, col.isFormula, col.formula]), [["A", false, ""], ["Double", true, "rec.A * 2"]]);
  }],

  ["Import: formulas stay out of the payload when the option is not ticked, and leaving them out takes the option away", async (page, grist) => {
    await analyse(page, WITH_FORMULA);
    await apply(page);
    const [[, , columns]] = grist.calls[0];
    assert.deepEqual(columns.map((col) => [col.id, col.isFormula, col.formula]), [["A", false, ""], ["Double", false, ""]]);

    await analyse(page, WITH_FORMULA);
    await page.locator("#columns-preview-body tr", { hasText: "Double" }).locator("input").click();
    assert.equal(await hidden(page, "formulas-row"), true);
  }],

  ["Import: the formulas of an existing table's new columns follow the same option", async (page, grist) => {
    await analyse(page, WITH_FORMULA.replace("A = grist.Int()", "Fresh = grist.Int()"));
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await hidden(page, "formulas-row"), false);
    await page.check("#with-formulas");
    await apply(page);
    const added = grist.calls.flat().map(([name, , id, payload]) => [name, id, payload.isFormula, payload.formula]);
    assert.deepEqual(added, [["AddVisibleColumn", "Fresh", false, ""], ["AddVisibleColumn", "Double", true, "rec.A * 2"]]);
  }],

  ["Import: two-way references created together are marked, and one left alone is said to become a plain reference", async (page) => {
    await analyse(page, TWO_WAY);
    assert.deepEqual(await previewRows(page), ["Pets", "OwnerRéférence vers « People » bidirectionnelle", "People", "PetsRéférences vers « Pets » (liste) bidirectionnelle"]);
    assert.deepEqual(await warnings(page), []);

    await page.locator("#columns-preview-body tr", { hasText: "Références vers" }).locator("input").click();
    assert.deepEqual(await previewRows(page), ["Pets", "OwnerRéférence vers « People »", "People", "PetsRéférences vers « Pets » (liste)"]);
    assert.match((await warnings(page)).join(" "), /Table « Pets » — Références bidirectionnelles créées comme références simples .*: Owner\./);
  }],

  ["Import: the fields are named, linked to their error, and the result is announced", async (page) => {
    await analyse(page, MULTI);
    assert.equal(await page.getByRole("textbox", { name: "TableA" }).count(), 1);
    await page.getByRole("textbox", { name: "TableB" }).fill("TableA");
    assert.equal(await page.getByRole("textbox", { name: "TableB" }).getAttribute("aria-invalid"), "true");
    const error = await page.getByRole("textbox", { name: "TableB" }).getAttribute("aria-describedby");
    assert.match(await page.textContent(`#${error}`), /plusieurs fois/);
    assert.equal(await textOf(page, "#import-announcement"), "Analyse terminée : 2 tables, 3 colonnes au total.");
    assert.equal(await page.getByRole("radiogroup", { name: /Que faire/ }).count(), 1);
  }],

  ["Accessibility: a main landmark, a heading per step, and tabs that Home and End reach", async (page) => {
    assert.equal(await page.getByRole("main").count(), 1);
    assert.deepEqual(await page.getByRole("heading", { level: 2 }).allTextContents(), ["1. Code source"], "the steps shown on load");
    await page.focus("#tab-import");
    await page.keyboard.press("End");
    assert.equal(await page.getAttribute("#tab-export", "aria-selected"), "true");
    assert.equal(await page.evaluate(() => document.activeElement.id), "tab-export");
    await page.keyboard.press("Home");
    assert.equal(await page.getAttribute("#tab-import", "aria-selected"), "true");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.getAttribute("#tab-export", "aria-selected"), "true", "the arrows still wrap around");
  }],

  ["Accessibility: no screen scrolls sideways at 320 px, the width WCAG asks content to reflow to", async (page) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(await overflows(), false, "empty");
    await analyse(page, RICH_SOURCE);
    assert.equal(await overflows(), false, "preview");
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await overflows(), false, "existing table");
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
    await page.click("#generate-btn");
    await page.waitForSelector("#export-output-block:not([hidden])");
    assert.equal(await overflows(), false, "export");
  }],

  ["Accessibility: every checkbox of the preview is a target of at least 24 px, whatever its row", async (page) => {
    await analyse(page, MULTI);
    const sizes = await page.$$eval(".col-checkbox label", (labels) => labels.map((label) => [label.offsetWidth, label.offsetHeight]));
    assert.equal(sizes.length, 4, "the head and three columns");
    for (const [width, height] of sizes) assert.ok(width >= 24 && height >= 24, `${width} x ${height}`);
  }],

  ["Accessibility: in forced colours the selected tab and the cards that background alone marked keep an outline", async (page) => {
    await page.emulateMedia({ forcedColors: "active" });
    const outline = await page.$eval("#tab-import", (tab) => [getComputedStyle(tab).outlineStyle, getComputedStyle(tab).outlineWidth]);
    assert.deepEqual(outline, ["solid", "2px"]);
    assert.equal(await page.$eval("#tab-export", (tab) => getComputedStyle(tab).outlineStyle), "none", "only the selected one");
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
    assert.equal(await page.textContent("#refs-include-btn"), "Inclure cette table", "one table is missing: singular");
    await page.click("#refs-include-btn");
    assert.equal(await hidden(page, "export-refs-banner"), true);
    assert.equal(await count(page, "#export-table-list input:checked"), 2);
  }],

  ["Export: the list keeps its ticks when refreshed, and one box ticks them all", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Standalone_Table" }).locator("input").check();
    assert.equal(await page.evaluate(() => document.getElementById("export-select-all").indeterminate), true, "some are ticked");

    await page.click("#refresh-tables-btn");
    await page.waitForSelector("#export-table-list input:checked");
    assert.deepEqual(await page.$$eval("#export-table-list input:checked", (boxes) => boxes.map((box) => box.value)), ["Standalone_Table"]);

    await page.check("#export-select-all");
    assert.equal(await count(page, "#export-table-list input:checked"), 3);
    await page.uncheck("#export-select-all");
    assert.equal(await count(page, "#export-table-list input:checked"), 0);
    assert.equal(await page.isDisabled("#generate-btn"), true);
  }],

  ["Export: a failed copy says what to do instead, in a message of its own", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Standalone_Table" }).locator("input").check();
    await page.click("#generate-btn");
    await page.waitForSelector("#export-output-block:not([hidden])");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }));
    await page.click("#copy-btn");
    await page.waitForSelector("#copy-status.status-info");
    assert.match(await page.textContent("#copy-status"), /Ctrl\+C/);
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
after(() => widget.close());

test("the saved theme and language apply before any module has run", async () => {
  const page = await widget.browser.newPage();
  await page.route("https://docs.getgrist.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  await page.route("**/js/app.js", (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("gristFactory.theme", "dark");
    localStorage.setItem("gristFactory.locale", "en");
  });
  await page.goto(widget.url);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.lang]), ["dark", "en"]);
  await page.close();
});

test("an English reader never sees the French markup: the page waits for its translation, and shows itself anyway after two seconds", async () => {
  const translated = await widget.open(fakeGrist(), { locale: "en" });
  assert.deepEqual(
    await translated.evaluate(() => [document.documentElement.dataset.pendingLocale, getComputedStyle(document.body).visibility, document.querySelector("h1").textContent]),
    [undefined, "visible", "Table structure"]
  );
  await translated.close();

  const stuck = await widget.browser.newPage();
  await stuck.route("https://docs.getgrist.com/**", (route) => route.fulfill({ contentType: "text/javascript", body: "" }));
  await stuck.route("**/js/app.js", (route) => route.abort());
  await stuck.addInitScript(() => localStorage.setItem("gristFactory.locale", "en"));
  await stuck.goto(widget.url);
  assert.equal(await stuck.evaluate(() => getComputedStyle(document.body).visibility), "hidden");
  await stuck.waitForFunction(() => getComputedStyle(document.body).visibility === "visible", null, { timeout: 5000 });
  await stuck.close();
});

const SCREENS = [
  ["the empty Import tab", async () => {}],
  ["the Import preview", async (page) => analyse(page, RICH_SOURCE)],
  [
    "the Import preview of an existing table",
    async (page) => {
      await analyse(page, RICH_SOURCE);
      await page.click('label.mode-card:has(input[value="existing"])');
      await page.selectOption("#target-table-select", { label: "Existing_Table" });
    },
  ],
  [
    "the Export tab with its code",
    async (page) => {
      await page.click("#tab-export");
      await page.waitForSelector("#export-table-list input");
      await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
      await page.click("#generate-btn");
      await page.waitForSelector("#export-output-block:not([hidden])");
    },
  ],
  ["the Réglages dialog", async (page) => page.click("#settings-btn")],
];

for (const theme of ["light", "dark"]) {
  for (const locale of ["fr", "en"]) {
    test(`axe-core finds nothing to fix on the main screens (${theme}, ${locale})`, async () => {
      for (const [name, setup] of SCREENS) {
        const page = await widget.open(fakeGrist(), { locale, bypassCSP: true });
        try {
          await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
          await setup(page);
          assert.deepEqual(await violations(page), [], name);
        } finally {
          await page.close();
        }
      }
    });
  }
}

test("a short pane keeps the buttons in view: the title and the code box shrink", async () => {
  const page = await widget.open(fakeGrist());
  await page.setViewportSize({ width: 600, height: 500 });
  const bottom = await page.$eval("#analyze-btn", (button) => button.getBoundingClientRect().bottom);
  assert.ok(bottom <= 500, `Analyser ends at ${bottom} px of a 500 px pane`);
  await page.close();
});

for (const [name, check, options] of TESTS) {
  test(name, async () => {
    const grist = fakeGrist(options);
    const page = await widget.open(grist, options);
    try {
      await check(page, grist);
      assert.deepEqual(page.problems, [], "console error, page error or CSP violation");
    } finally {
      await page.close();
    }
  });
}
