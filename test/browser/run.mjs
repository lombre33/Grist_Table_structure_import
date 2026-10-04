/**
 * Interface checks: the real index.html in Chromium (Playwright, a dev-only
 * dependency never shipped), with an in-memory `grist` (fakeGrist.mjs), each check
 * on a fresh page. Behaviour against a real Grist is in test/grist.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { launchWidget } from "./widgetPage.mjs";
import { fakeGrist } from "./fakeGrist.mjs";
import { analyse, apply, choice, description, isElementKept, keepElement, leaveOutElement, offered, previewRows, textOf, unfold, warnings } from "./driver.mjs";
import { violations } from "./a11y.mjs";
import { plain } from "../helpers.mjs";

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

const WITH_REQUEST = "@grist.UserTable\nclass Fetch:\n  A = grist.Text()\n\n  @grist.formulaType(grist.Text())\n  def Remote(rec, table):\n    return REQUEST('https://example.org/?q=' + rec.A).content\n\n  @grist.formulaType(grist.Int())\n  def Double(rec, table):\n    return 2\n";

const RICH_SOURCE = (() => {
  const twoWay = "@grist.UserTable\nclass Pets:\n  Owner = grist.Reference('People', reverse_of='Pets')\n\n@grist.UserTable\nclass People:\n  Pets = grist.ReferenceList('Pets', reverse_of='Owner')\n";
  const formula = "\n@grist.UserTable\nclass X:\n  A = grist.Int()\n\n  @grist.formulaType(grist.Int())\n  def Double(rec, table):\n    return rec.A * 2\n";
  return twoWay + formula;
})();

/** Every element once: a label, a description, a choice list, display options, a display column, a two-way link (both ends) and a formula. */
const ALL_ELEMENTS = [
  "@grist.UserTable",
  "class Tasks:",
  "  Title = grist.Text(label='Titre', description='Ce qu’il faut faire')",
  "  Status = grist.Choice(choices=['Todo', 'Done'], widget_options='{\"alignment\":\"center\"}')",
  "  Owner = grist.Reference('People', visible_col='Name', reverse_of='Tasks')",
  "",
  "  @grist.formulaType(grist.Int())",
  "  def Late(rec, table):",
  "    return 1",
  "",
  "@grist.UserTable",
  "class People:",
  "  Name = grist.Text()",
  "  Tasks = grist.ReferenceList('Tasks', reverse_of='Owner')",
  "",
].join("\n");

const EVERY_ELEMENT = ["Libellés", "Descriptions des colonnes", "Listes de choix", "Format des cellules", "Colonne affichée des références", "Liens bidirectionnels", "Formules"];

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


/** The tables of the Export tab that are shown, and those that are ticked (shown or not). */
const shownTables = (page) => page.$$eval("#export-table-list li:not([hidden])", (items) => items.map((item) => item.textContent));
const tickedTables = (page) => page.$$eval("#export-table-list input:checked", (boxes) => boxes.map((box) => box.value));
/** The ids of the tables ticked, apart from the boxes of their columns. */
const tickedTablesBoxes = async (page) => (await page.$$eval("#export-table-list input.table-box:checked", (boxes) => boxes.map((box) => box.value))).join(", ");
const ALL_TABLES = ["Existing_Table", "Other_Table", "Standalone_Table"];
/** The same with five more tables (`extraTables: 5`): enough for the search to be offered. */
const EVERY_TABLE = ["Existing_Table", "Ledger_1", "Ledger_2", "Ledger_3", "Ledger_4", "Ledger_5", "Other_Table", "Standalone_Table"];

/** Clicks Générer le code and returns the code, once it is written. */
const generate = async (page) => {
  await page.click("#generate-btn");
  await page.waitForFunction(() => !document.getElementById("generate-btn").disabled && !document.getElementById("export-output-block").hidden);
  return page.inputValue("#export-output");
};

/** Ticks a table of the Export tab, once its list is there. */
const tick = async (page, tableId) => {
  await page.waitForSelector("#export-table-list input");
  await page.locator("#export-table-list li", { hasText: tableId }).locator("input").check();
};

/** Makes every reading of the document take 300 ms, to look at what the page does meanwhile. */
const slowFetch = (grist) => {
  const fetchTable = grist.docApi.fetchTable;
  grist.docApi.fetchTable = async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fetchTable(...args);
  };
};

/** Starts counting what is written in the element `id`; `writes(page)` says how many writes there have been since. */
const countWrites = (page, id) =>
  page.evaluate((target) => {
    window.writes = 0;
    new MutationObserver((records) => (window.writes += records.length)).observe(document.getElementById(target), { childList: true, characterData: true, subtree: true });
  }, id);
const writes = (page) => page.evaluate(() => window.writes);

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
    await page.click('label.segmented-option:has(input[value="existing"])');
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

  ["Import: the action asks for a confirmation that says what will be written, and writes nothing before it", async (page, grist) => {
    await analyse(page, TYPES);
    await page.click("#action-btn");
    const dialog = page.getByRole("dialog", { name: "Créer cette table ?" });
    assert.equal(await dialog.count(), 1);
    assert.equal(await page.evaluate(() => document.querySelector("dialog:modal")?.id), "confirm-dialog", "modal: the page behind cannot be used");
    assert.equal(await textOf(page, "#confirm-intro"), "Sera ajouté à ce document :");
    assert.deepEqual((await page.$$eval("#confirm-list li", (items) => items.map((item) => item.textContent))).map(plain), ["X — 2 colonnes"]);
    assert.equal(await count(page, "#confirm-notes p"), 0, "no formula, no warning");
    assert.match(await textOf(page, "#confirm-dialog .hint"), /^Rien n’est supprimé ni modifié dans ce qui existe déjà ; Ctrl\+Z annule l’action\.$/);
    assert.equal(await textOf(page, "#confirm-ok-btn"), "Créer la table dans ce document", "the button says what the one that opened the dialog said");
    assert.equal(await textOf(page, "#confirm-cancel-btn"), "Annuler");
    assert.equal(await page.evaluate(() => document.activeElement.id), "confirm-ok-btn", "Enter confirms");
    assert.equal(grist.calls.length, 0, "nothing is written while the user is asked");

    await page.click("#confirm-ok-btn");
    await page.waitForSelector("#import-status-region .status-success");
    assert.equal(grist.calls.length, 1);
    assert.equal(await page.evaluate(() => document.getElementById("confirm-dialog").open), false);
  }],

  ["Import: Annuler and Escape write nothing, give the focus back and keep the preview, and a cancel after a confirmation is still a cancel", async (page, grist) => {
    await analyse(page, TYPES);
    const kept = async () => [grist.calls.length, await page.evaluate(() => [document.getElementById("confirm-dialog").open, document.getElementById("preview-section").hidden, document.activeElement.id]), await previewRows(page)];
    await page.click("#action-btn");
    await page.click("#confirm-cancel-btn");
    assert.deepEqual(await kept(), [0, [false, false, "action-btn"], ["ARéférence vers « Other_Table »", "BEntier"]], "Annuler: nothing written, the preview and the button as they were");
    await page.click("#action-btn");
    await page.keyboard.press("Escape");
    assert.deepEqual((await kept()).slice(0, 2), [0, [false, false, "action-btn"]], "Escape does the same");

    await apply(page);
    assert.equal(grist.calls.length, 1, "confirmed once");
    await analyse(page, "@grist.UserTable\nclass Second:\n  A = grist.Text()\n");
    await page.click("#action-btn");
    await page.keyboard.press("Escape");
    assert.equal(grist.calls.length, 1, "what the last use of the dialog decided does not decide this one");
  }],

  ["Import: the confirmation answers no to Escape, so that whatever asked it can go on", async (page) => {
    await page.evaluate(async () => {
      const { createConfirmation } = await import("/js/importConfirm.js");
      window.answers = [];
      createConfirmation()({ title: "Titre", intro: "Intro", lines: ["a"], notes: [], action: "OK" }).then((answer) => window.answers.push(answer));
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.answers.length === 1);
    assert.deepEqual(await page.evaluate(() => window.answers), [false]);
  }],

  ["Import: several tables are listed with the ids typed and the columns still ticked, and Enter confirms", async (page, grist) => {
    await analyse(page, MULTI);
    await page.getByRole("textbox", { name: "TableB" }).fill("Renamed");
    await page.locator("#columns-preview-body tr", { hasText: "Extra" }).locator("input").uncheck();
    await page.click("#action-btn");
    assert.equal(await textOf(page, "#confirm-title"), "Créer ces 2 tables ?");
    assert.deepEqual((await page.$$eval("#confirm-list li", (items) => items.map((item) => item.textContent))).map(plain), ["TableA — 1 colonne", "Renamed — 1 colonne"]);
    assert.equal(await textOf(page, "#confirm-ok-btn"), "Créer 2 tables dans ce document");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#import-status-region .status-success");
    assert.deepEqual(grist.calls[0].map(([, tableId]) => tableId), ["TableA", "Renamed"]);
  }],

  ["Import: the confirmation for an existing table names it, and lists the columns that will be added and none of those already there", async (page, grist) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Name = grist.Text()\n  Fresh = grist.Int()\n  Other = grist.Text()\n");
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    await page.click("#action-btn");
    assert.equal(await textOf(page, "#confirm-title"), "Ajouter à « Existing_Table » ?");
    assert.equal(await textOf(page, "#confirm-intro"), "Ces 2 colonnes seront ajoutées :");
    assert.deepEqual(await page.$$eval("#confirm-list li", (items) => items.map((item) => item.textContent)), ["Fresh", "Other"], "Name is there already");
    await page.click("#confirm-cancel-btn");
    await page.locator("#columns-preview-body tr", { hasText: "Other" }).locator("input").uncheck();
    await page.click("#action-btn");
    assert.equal(await textOf(page, "#confirm-intro"), "Cette colonne sera ajoutée :");
    assert.deepEqual(await page.$$eval("#confirm-list li", (items) => items.map((item) => item.textContent)), ["Fresh"]);
    assert.equal(await textOf(page, "#confirm-ok-btn"), "Ajouter 1 colonne à « Existing_Table »");
    assert.equal(grist.calls.length, 0);
    await page.click("#confirm-ok-btn");
    await page.waitForSelector("#import-status-region .status-success");
    assert.equal(grist.calls.flat().length, 1, "one column added");
  }],

  ["Import: the confirmation warns that formulas will run, when they are ticked and there are some", async (page) => {
    await analyse(page, WITH_FORMULA);
    const notes = () => page.$$eval("#confirm-notes p", (items) => items.map((item) => item.textContent));
    await page.click("#action-btn");
    assert.deepEqual(await notes(), [], "left out, they are created empty: nothing will run");
    await page.click("#confirm-cancel-btn");
    await keepElement(page, "import", "Formules");
    await page.click("#action-btn");
    assert.deepEqual((await notes()).map(plain), ["Les formules s’exécuteront dans ce document dès leur création : ne confirmez que pour du code de confiance."]);
    assert.equal(await page.$eval("#confirm-notes p", (note) => note.className), "status status-warning", "a caution, not an information");
    await page.click("#confirm-cancel-btn");
    await analyse(page, TYPES);
    await page.click("#action-btn");
    assert.deepEqual(await notes(), [], "no formula in the text, nothing to warn about");
  }],

  ["Import: the confirmation names the formulas that call REQUEST, which can send data out, and not the others", async (page) => {
    await analyse(page, WITH_REQUEST);
    await keepElement(page, "import", "Formules");
    await page.click("#action-btn");
    assert.deepEqual((await page.$$eval("#confirm-notes p", (items) => items.map((item) => item.textContent))).map(plain), [
      "Les formules s’exécuteront dans ce document dès leur création : ne confirmez que pour du code de confiance.",
      "Fetch.Remote : cette formule appelle REQUEST, qui peut envoyer des données de ce document vers un autre serveur. Ne confirmez que si vous faites confiance à ce code.",
    ]);
    await page.click("#confirm-cancel-btn");
    await leaveOutElement(page, "import", "Formules");
    await page.click("#action-btn");
    assert.equal(await count(page, "#confirm-notes p"), 0, "left out, the formulas are not created: nothing will call REQUEST");
  }],

  ["Import: the warning about REQUEST speaks English to an English reader", async (page) => {
    await analyse(page, WITH_REQUEST);
    await keepElement(page, "import", "Formulas");
    await page.click("#action-btn");
    assert.equal(await page.locator("#confirm-notes p").last().textContent(), "Fetch.Remote: this formula calls REQUEST, which can send data from this document to another server. Only confirm if you trust this code.");
  }, { locale: "en" }],

  ["Import: the confirmation speaks the language of the page", async (page) => {
    await analyse(page, TYPES);
    await page.click("#action-btn");
    assert.equal(await page.getByRole("dialog", { name: "Create this table?" }).count(), 1);
    assert.equal(await textOf(page, "#confirm-intro"), "Will be added to this document:");
    assert.deepEqual(await page.$$eval("#confirm-list li", (items) => items.map((item) => item.textContent)), ["X — 2 columns"]);
    assert.equal(await textOf(page, "#confirm-dialog .hint"), "Nothing that already exists is removed or changed; Ctrl+Z undoes the action.");
    assert.equal(await textOf(page, "#confirm-cancel-btn"), "Cancel");
    assert.equal(await textOf(page, "#confirm-ok-btn"), "Create the table in this document");
  }, { locale: "en" }],

  ["Import: a key held down since the action button is not a decision, and a long id does not make the dialog overflow a pane of 320 px", async (page, grist) => {
    await page.setViewportSize({ width: 320, height: 600 });
    await analyse(page, `@grist.UserTable\nclass ${"Long_identifier_".repeat(6)}:\n  A = grist.Text()\n`);
    await page.click("#action-btn");
    const prevented = (repeat) =>
      page.evaluate((repeating) => {
        const event = new KeyboardEvent("keydown", { key: "Enter", repeat: repeating, bubbles: true, cancelable: true });
        document.getElementById("confirm-ok-btn").dispatchEvent(event);
        return event.defaultPrevented;
      }, repeat);
    assert.equal(await prevented(true), true, "the repeats of a held key are ignored");
    assert.equal(await prevented(false), false, "the key pressed on purpose is not");
    assert.equal(grist.calls.length, 0);
    const box = await page.$eval("#confirm-dialog", (dialog) => {
      const { left, right } = dialog.getBoundingClientRect();
      return [Math.round(left), Math.round(right), dialog.scrollWidth <= dialog.clientWidth, document.documentElement.scrollWidth <= document.documentElement.clientWidth];
    });
    assert.ok(box[0] >= 0 && box[1] <= 320, `the dialog is from ${box[0]} to ${box[1]} px in a pane of 320 px`);
    assert.deepEqual(box.slice(2), [true, true], "nothing scrolls sideways");
  }],

  ["Import: a double click asks once and creates once", async (page, grist) => {
    await analyse(page, MULTI);
    await page.dblclick("#action-btn");
    assert.equal(await page.locator("dialog[open]").count(), 1, "one confirmation");
    assert.equal(grist.calls.length, 0, "nothing is written before it");
    await page.dblclick("#confirm-ok-btn");
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
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await page.locator("#columns-preview-body input:disabled").count(), 1);
    assert.equal(await textOf(page, "#action-btn"), "Ajouter 1 colonne à « Existing_Table »", "the button names what it will change");
  }],

  ["Import: a column already in the table raises no note, since it is not imported", async (page) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Name = grist.Mystery()\n\n  @grist.formulaType(grist.Int())\n  def Computed(rec, table):\n    return 1\n  Fresh = grist.Text()\n");
    assert.equal((await warnings(page)).length, 2, "to create the table, both are noted");
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.deepEqual(await warnings(page), [], "Name and Computed are in Existing_Table already");
  }],

  ["Import: the formulas option goes with the tables, and is unticked at every analysis", async (page, grist) => {
    await analyse(page, WITH_FORMULA);
    assert.equal(await hidden(page, "import-elements"), false);
    await keepElement(page, "import", "Formules");
    await analyse(page, WITH_FORMULA);
    assert.equal(await isElementKept(page, "import", "Formules"), false, "what was decided for a text that is no longer there");
    await keepElement(page, "import", "Formules");
    await analyse(page, "nothing to read here");
    assert.equal(await hidden(page, "import-elements"), true);
    await analyse(page, WITH_FORMULA);
    assert.equal(await isElementKept(page, "import", "Formules"), false);
    await apply(page);
    assert.deepEqual(grist.calls[0][0][2].map((col) => [col.id, col.isFormula]), [["A", false], ["Double", false]]);
  }],

  ["Import: editing the text while the document is being read announces and shows nothing", async (page, grist) => {
    slowFetch(grist);
    await page.fill("#source-input", MULTI);
    await page.click("#analyze-btn");
    await page.fill("#source-input", `${MULTI}\n`);
    await page.waitForFunction(() => !document.getElementById("analyze-btn").disabled);
    await page.waitForTimeout(100);
    assert.equal(await page.textContent("#import-announcement"), "");
    assert.equal(await hidden(page, "preview-section"), true);
  }],

  ["Import: the message about a document that cannot be read follows the language", async (page, grist) => {
    grist.docApi.fetchTable = async () => {
      throw new Error("unreadable");
    };
    await analyse(page, MULTI);
    await page.click('label.segmented-option:has(input[value="existing"])');
    assert.equal(await textOf(page, "#target-table-error"), "Impossible de charger la liste des tables de ce document.");
    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.equal(await textOf(page, "#target-table-error"), "Could not load this document’s table list.");
    assert.equal(page.problems.length, 1, "the failure is logged, as it is meant to be");
    page.problems.length = 0;
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
    assert.equal(await hidden(page, "import-elements"), true);

    await analyse(page, WITH_FORMULA);
    assert.equal(await hidden(page, "import-elements"), false);
    await unfold(page, "import");
    assert.equal(await page.getByRole("checkbox", { name: /Formules/ }).isChecked(), false);
    assert.match(await textOf(page, "#warnings-list"), /créées vides : Double/);
    assert.deepEqual(await previewRows(page), ["AEntier", "DoubleEntier formule"]);

    await keepElement(page, "import", "Formules");
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
    assert.equal(await hidden(page, "import-elements"), true);
  }],

  ["Import: the formulas of an existing table's new columns follow the same option", async (page, grist) => {
    await analyse(page, WITH_FORMULA.replace("A = grist.Int()", "Fresh = grist.Int()"));
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await hidden(page, "import-elements"), false);
    await keepElement(page, "import", "Formules");
    await apply(page);
    const added = grist.calls.flat().map(([name, , id, payload]) => [name, id, payload.isFormula, payload.formula]);
    assert.deepEqual(added, [["AddVisibleColumn", "Fresh", false, ""], ["AddVisibleColumn", "Double", true, "rec.A * 2"]]);
  }],

  ["Import: the elements offered are those the text really has, with how many columns carry each, all ticked but the formulas", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await hidden(page, "import-elements"), false);
    assert.deepEqual(await offered(page, "import"), [
      "[x] Libellés (1 colonne)",
      "[x] Descriptions des colonnes (1 colonne)",
      "[x] Listes de choix (1 colonne)",
      "[x] Format des cellules (1 colonne)",
      "[x] Colonne affichée des références (1 colonne)",
      "[x] Liens bidirectionnels (2 colonnes)",
      "[ ] Formules (1 colonne)",
    ]);

    await analyse(page, "@grist.UserTable\nclass X:\n  A = grist.Text(label='Un')\n  B = grist.Text(label='Deux')\n");
    assert.deepEqual(await offered(page, "import"), ["[x] Libellés (2 colonnes)"], "nothing else is in the text");
    assert.equal(await hidden(page, "formulas-hint"), true, "the warning about formulas goes with them");

    await analyse(page, WITH_FORMULA);
    assert.equal(await hidden(page, "formulas-hint"), false);
    assert.equal(await choice(page, "import", "Formules").getAttribute("aria-describedby"), "import-elements-list-formulas-hint formulas-hint", "what the element is, then what it risks");
  }],

  ["Import: the counts follow the tables and the columns that are ticked", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await page.locator("#table-multi-select input").nth(1).uncheck();
    assert.deepEqual(await offered(page, "import"), [
      "[x] Libellés (1 colonne)",
      "[x] Descriptions des colonnes (1 colonne)",
      "[x] Listes de choix (1 colonne)",
      "[x] Format des cellules (1 colonne)",
      "[ ] Formules (1 colonne)",
    ], "People is not created: Owner becomes Any, which shows no column and is linked to none");
    await page.locator("#table-multi-select input").nth(1).check();

    await page.locator("#columns-preview-body tr", { hasText: "Late" }).locator("input").uncheck();
    await page.locator("#columns-preview-body tr", { hasText: "Title" }).locator("input").uncheck();
    assert.deepEqual(await offered(page, "import"), [
      "[x] Listes de choix (1 colonne)",
      "[x] Format des cellules (1 colonne)",
      "[x] Colonne affichée des références (1 colonne)",
      "[x] Liens bidirectionnels (2 colonnes)",
    ], "neither the label nor the description, nor the formula, is left");

    await page.click("#columns-select-all"); // some were ticked: all are
    await page.click("#columns-select-all");
    assert.equal(await hidden(page, "import-elements"), true, "no column left, nothing to choose");
  }],

  ["Import: the choices made stay while the preview changes, and are made again at every analysis", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await leaveOutElement(page, "import", "Libellés");
    await keepElement(page, "import", "Formules");
    await page.locator("#table-multi-select input").nth(1).uncheck();
    await page.locator("#table-multi-select input").nth(1).check();
    assert.deepEqual((await offered(page, "import")).filter((item) => /Libellés|Formules/.test(item)), ["[ ] Libellés (1 colonne)", "[x] Formules (1 colonne)"]);

    await analyse(page, ALL_ELEMENTS);
    assert.deepEqual((await offered(page, "import")).filter((item) => /Libellés|Formules/.test(item)), ["[x] Libellés (1 colonne)", "[ ] Formules (1 colonne)"]);
  }],

  ["Import: an element left out is not created, and the others are", async (page, grist) => {
    await analyse(page, ALL_ELEMENTS);
    await leaveOutElement(page, "import", "Listes de choix");
    await leaveOutElement(page, "import", "Libellés");
    await apply(page);
    const [[, , tasks], [, , people]] = grist.calls[0];
    assert.deepEqual(tasks.map((col) => [col.id, col.label, col.widgetOptions && JSON.parse(col.widgetOptions)]), [["Title", "Title", undefined], ["Status", "Status", { alignment: "center" }], ["Owner", "Owner", undefined], ["Late", "Late", undefined]]);
    assert.deepEqual(people.map((col) => col.id), ["Name", "Tasks"]);
    const changes = grist.calls.slice(1).flat().filter(([name]) => name === "ModifyColumn").map(([, table, id, change]) => [table, id, Object.keys(change).sort()]);
    assert.deepEqual(changes, [["Tasks", "Title", ["description"]], ["Tasks", "Owner", ["reverseCol"]]], "the description is added, and the link is made; no id is untied, since there is no label left");
  }],

  ["Import: with every element left out, only the id and the type of each column are sent", async (page, grist) => {
    await analyse(page, ALL_ELEMENTS);
    for (const name of EVERY_ELEMENT.slice(0, 6)) await leaveOutElement(page, "import", name);
    assert.equal(await hidden(page, "warnings-block"), false, "the formulas are still said to be created empty");
    assert.equal(await page.getByText("Références bidirectionnelles créées comme références simples").count(), 0, "a link that was left out is no plain reference that was meant to be a link");
    await apply(page);
    assert.equal(grist.calls.length, 1, "nothing to add afterwards");
    const [[, , tasks]] = grist.calls[0];
    assert.deepEqual(tasks.map((col) => [col.id, col.type, col.label, col.widgetOptions]), [["Title", "Text", "Title", undefined], ["Status", "Choice", "Status", undefined], ["Owner", "Ref:People", "Owner", undefined], ["Late", "Int", "Late", undefined]]);
  }],

  ["Import: an existing table's elements are those of the columns that will be added", async (page) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Name = grist.Text(label='Nom')\n  Fresh = grist.Text(description='Neuve')\n");
    assert.deepEqual(await offered(page, "import"), ["[x] Libellés (1 colonne)", "[x] Descriptions des colonnes (1 colonne)"]);
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.deepEqual(await offered(page, "import"), ["[x] Descriptions des colonnes (1 colonne)"], "Name is in the table already: its label is not imported");
    await page.selectOption("#target-table-select", { label: "Standalone_Table" });
    assert.deepEqual(await offered(page, "import"), ["[x] Libellés (1 colonne)", "[x] Descriptions des colonnes (1 colonne)"]);
  }],

  ["Import: the elements left out are not added to an existing table either", async (page, grist) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Fresh = grist.Choice(choices=['a'], label='Nouvelle', description='Une note', widget_options='{\"alignment\":\"center\"}')\n");
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    await leaveOutElement(page, "import", "Listes de choix");
    await leaveOutElement(page, "import", "Libellés");
    await apply(page);
    const [[[, , id, payload]], followUp] = grist.calls;
    assert.deepEqual([id, payload.label, JSON.parse(payload.widgetOptions)], ["Fresh", "Fresh", { alignment: "center" }]);
    assert.deepEqual(followUp, [["ModifyColumn", "Existing_Table", "Fresh", { description: "Une note" }]], "the description is added, and no id is untied since the label is left out");
  }],

  ["Import: a reference to a table that is nowhere offers neither its display column nor its link", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await page.locator("#table-multi-select input").nth(1).uncheck();
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Standalone_Table" });
    assert.deepEqual((await offered(page, "import")).filter((item) => /affichée|bidirectionnels|Format/.test(item)), ["[x] Format des cellules (1 colonne)"], "Owner became Any: it has neither");
  }],

  ["Import: the elements are named in the language of the page, and keep their ticks when it changes", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await leaveOutElement(page, "import", "Libellés");
    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.deepEqual(await offered(page, "import"), [
      "[ ] Labels (1 column)",
      "[x] Column descriptions (1 column)",
      "[x] Choice lists (1 column)",
      "[x] Cell format (1 column)",
      "[x] Column shown by references (1 column)",
      "[x] Two-way links (2 columns)",
      "[ ] Formulas (1 column)",
    ]);
    assert.equal(await textOf(page, "#import-elements-title"), "Elements to import");
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
    const [error, about] = (await page.getByRole("textbox", { name: "TableB" }).getAttribute("aria-describedby")).split(" ");
    assert.match(await page.textContent(`#${error}`), /plusieurs fois/);
    assert.equal(about, error.replace("-error", "-description"), "and by the description of the table, which it may not have");
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
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await overflows(), false, "preview with every element, folded");
    await unfold(page, "import");
    assert.equal(await overflows(), false, "preview with every element, unfolded");
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await overflows(), false, "existing table");
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await generate(page);
    assert.equal(await overflows(), false, "export");
    await page.fill("#export-search", "Very_long_".repeat(12));
    assert.equal(await overflows(), false, "a long search, said back");
  }, { extraTables: 5 }],

  ["Accessibility: every checkbox of the preview is a target of at least 24 px, whatever its row", async (page) => {
    await analyse(page, MULTI);
    const sizes = await page.$$eval(".col-checkbox label", (labels) => labels.map((label) => [label.offsetWidth, label.offsetHeight]));
    assert.equal(sizes.length, 4, "the head and three columns");
    for (const [width, height] of sizes) assert.ok(width >= 24 && height >= 24, `${width} x ${height}`);

    await analyse(page, ALL_ELEMENTS);
    await unfold(page, "import");
    const boxes = await page.$$eval("#import-elements-list li:not([hidden]) label", (labels) => labels.map((label) => [label.offsetWidth, label.offsetHeight]));
    assert.equal(boxes.length, 7);
    for (const [width, height] of boxes) assert.ok(width >= 24 && height >= 24, `${width} x ${height}`);
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
    await tick(page, "Standalone_Table");
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

  ["Export: the elements offered are those of the tables ticked, with how many columns carry each, and all ticked", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-elements"), true, "no table, nothing to choose");
    await tick(page, "Standalone_Table");
    assert.equal(await hidden(page, "export-elements"), true, "this table has none of them");
    await tick(page, "Existing_Table");
    assert.deepEqual(await offered(page, "export"), [
      "[x] Libellés (1 colonne)",
      "[x] Descriptions des colonnes (1 colonne)",
      "[x] Listes de choix (1 colonne)",
      "[x] Format des cellules (1 colonne)",
      "[x] Colonne affichée des références (1 colonne)",
      "[x] Formules (1 colonne)",
    ]);
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").uncheck();
    assert.equal(await hidden(page, "export-elements"), true, "back to a table that has none of them");
  }],

  ["Export: what is unticked is left out of the code, and what is not is written", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    const generate = async () => {
      await page.click("#generate-btn");
      await page.waitForFunction(() => document.getElementById("export-output").value.includes("class Existing_Table") && !document.getElementById("generate-btn").disabled);
      return page.inputValue("#export-output");
    };
    const WRITTEN = { Libellés: "label='Humeur'", "Descriptions des colonnes": "description='Humeur du bénévole ce jour.'", "Listes de choix": "choices=['Content (ok)'", "Format des cellules": `"alignment":"center"`, "Colonne affichée des références": "visible_col='Label'", Formules: "def Computed(rec, table)" };

    const everything = await generate();
    for (const [name, written] of Object.entries(WRITTEN)) assert.ok(everything.includes(written), `${name} is written by default`);

    await leaveOutElement(page, "export", "Formules");
    await leaveOutElement(page, "export", "Colonne affichée des références");
    const text = await generate();
    for (const [name, written] of Object.entries(WRITTEN)) assert.equal(text.includes(written), !["Formules", "Colonne affichée des références"].includes(name), name);
    assert.match(text, /\n {2}Computed = grist\.Numeric\(\)\n/, "the column is still there, as plain data");

    for (const name of Object.keys(WRITTEN)) await leaveOutElement(page, "export", name);
    assert.match(await generate(), /class Existing_Table:\n {2}Name = grist\.Text\(\)\n {2}Age = grist\.Int\(\)\n {2}Mood = grist\.Choice\(\)\n {2}Owner = grist\.Reference\('Other_Table'\)\n {2}Computed = grist\.Numeric\(\)\n/, "the types alone, the columns that were formulas last as in Code View");
  }],

  ["Export: the choices made stay when the tables ticked change, when the list is read again and when the language changes", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await leaveOutElement(page, "export", "Formules");
    await tick(page, "Standalone_Table");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").uncheck();
    assert.equal(await hidden(page, "export-elements"), true);
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
    await page.click("#refresh-tables-btn");
    await page.waitForFunction(() => !document.getElementById("refresh-tables-btn").disabled);
    assert.equal(await isElementKept(page, "export", "Formules"), false);
    assert.equal(await isElementKept(page, "export", "Libellés"), true);

    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.deepEqual((await offered(page, "export")).filter((item) => /Formulas|Labels/.test(item)), ["[x] Labels (1 column)", "[ ] Formulas (1 column)"]);
    assert.equal(await textOf(page, "#export-elements-title"), "Elements to export");
  }],

  ["Accessibility: each group is named, and each of its boxes says what it is and how many columns carry it", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await page.getByRole("group", { name: "Éléments à importer" }).count(), 0, "folded, it is not read");
    await unfold(page, "import");
    assert.equal(await page.getByRole("group", { name: "Éléments à importer" }).count(), 1);
    assert.equal(await page.getByRole("checkbox", { name: /^Liens bidirectionnels 2 colonnes$/ }).count(), 1);
    assert.equal(await description(page, "#import-elements-list li:not([hidden]) input[aria-labelledby$='twoWay-count']"), "Deux références qui se mettent à jour l’une l’autre.");
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await unfold(page, "export");
    assert.equal(await page.getByRole("group", { name: "Éléments à exporter" }).count(), 1);
    assert.equal(await page.getByRole("checkbox", { name: /^Listes de choix 1 colonne$/ }).count(), 1);
  }],

  ["Export: typing a name narrows the list as it is typed, whatever the case or the order of the words", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-search-row"), false);
    assert.deepEqual(await shownTables(page), EVERY_TABLE);
    assert.equal(await textOf(page, "#export-search-status"), "", "nothing is said about a search that is not made");

    await page.fill("#export-search", "stand");
    assert.deepEqual(await shownTables(page), ["Standalone_Table"]);
    assert.equal(await textOf(page, "#export-search-status"), "1 table affichée sur 8.");
    await page.fill("#export-search", "OTHER");
    assert.deepEqual(await shownTables(page), ["Other_Table"]);
    await page.fill("#export-search", "table ex");
    assert.deepEqual(await shownTables(page), ["Existing_Table"], "the words in any order");
    await page.fill("#export-search", "_t");
    assert.deepEqual(await shownTables(page), ALL_TABLES, "the three that have a _t in their id");
    assert.equal(await textOf(page, "#export-search-status"), "3 tables affichées sur 8.");
    await page.fill("#export-search", "");
    assert.deepEqual(await shownTables(page), EVERY_TABLE);
    assert.equal(await textOf(page, "#export-search-status"), "");
  }, { extraTables: 5 }],

  ["Export: a search that finds nothing says so, and has nothing to tick; Escape clears it", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.fill("#export-search", "zzz");
    assert.deepEqual(await shownTables(page), []);
    assert.equal(await textOf(page, "#export-search-status"), "Aucune table ne correspond à « zzz ».");
    assert.equal(await page.isDisabled("#export-select-all"), true);

    // an event of our own, which no browser answers by clearing the field itself: only the widget can
    await page.evaluate(() => document.getElementById("export-search").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(await page.inputValue("#export-search"), "");
    assert.deepEqual(await shownTables(page), EVERY_TABLE);
    assert.equal(await page.isDisabled("#export-select-all"), false);

    await page.fill("#export-search", "stand");
    await page.press("#export-search", "Escape");
    assert.equal(await page.inputValue("#export-search"), "", "and the key itself");
  }, { extraTables: 5 }],

  ["Export: the tables ticked that a search hides stay ticked, are said, and are exported; the box on top ticks only what is shown", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.fill("#export-search", "stand");
    assert.equal(await textOf(page, "#export-search-status"), "1 table affichée sur 8. 1 table cochée est masquée.");
    assert.equal(await textOf(page, "#export-select-all-text"), "Cocher les tables affichées");

    await page.check("#export-select-all");
    assert.deepEqual(await tickedTables(page), ["Existing_Table", "Standalone_Table"], "Other_Table, which is hidden, is not ticked with them");
    assert.equal(await page.isChecked("#export-select-all"), true, "all that is shown is ticked");
    await page.uncheck("#export-select-all");
    assert.deepEqual(await tickedTables(page), ["Existing_Table"], "nor is Existing_Table unticked, which is hidden");

    await page.check("#export-select-all");
    const code = await generate(page);
    assert.deepEqual(["class Existing_Table", "class Standalone_Table", "class Other_Table"].map((text) => code.includes(text)), [true, true, false]);

    await page.fill("#export-search", "");
    assert.equal(await textOf(page, "#export-select-all-text"), "Tout cocher");
    assert.equal(await page.evaluate(() => document.getElementById("export-select-all").indeterminate), true, "two of eight");
  }, { extraTables: 5 }],

  ["Export: the search stays when the list is read again, and follows the language", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.fill("#export-search", "stand");
    await page.click("#refresh-tables-btn");
    await page.waitForFunction(() => !document.getElementById("refresh-tables-btn").disabled);
    assert.deepEqual(await shownTables(page), ["Standalone_Table"]);
    assert.equal(await page.inputValue("#export-search"), "stand");

    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.equal(await textOf(page, "#export-search-status"), "1 table shown of 8.");
    assert.equal(await textOf(page, "#export-select-all-text"), "Select the tables shown");
    assert.equal(await page.getAttribute("#export-search", "placeholder"), "Search tables…");
    await page.click("#settings-close-btn");
    await page.fill("#export-search", "zzz");
    assert.equal(await textOf(page, "#export-search-status"), "No table matches “zzz”.");
  }, { extraTables: 5 }],

  ["Export: the tables the banner asks to include are shown, whatever was searched", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.fill("#export-search", "exist");
    assert.deepEqual(await shownTables(page), ["Existing_Table"]);
    await page.click("#refs-include-btn");
    assert.equal(await page.inputValue("#export-search"), "", "Other_Table, just ticked, was hidden");
    assert.deepEqual(await shownTables(page), EVERY_TABLE);
    assert.deepEqual(await tickedTables(page), ["Existing_Table", "Other_Table"]);
  }, { extraTables: 5 }],

  ["Export: a search that shows the tables included keeps what was typed", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.fill("#export-search", "table");
    await page.click("#refs-include-btn");
    assert.equal(await page.inputValue("#export-search"), "table");
    assert.deepEqual(await tickedTables(page), ["Existing_Table", "Other_Table"]);
  }, { extraTables: 5 }],

  ["Export: what a search writes is text, never markup, and has no effect on the page", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.fill("#export-search", "<img src=x onerror=alert(1)>");
    assert.equal(await textOf(page, "#export-search-status"), "Aucune table ne correspond à « <img src=x onerror=alert(1)> ».");
    assert.equal(await count(page, "#export-search-status img"), 0);
  }, { extraTables: 5 }],

  ["Accessibility: the search field has a name, and its result is announced", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await page.getByRole("searchbox", { name: "Rechercher une table" }).count(), 1);
    assert.equal(await page.getAttribute("#export-search-status", "aria-live"), "polite");
    await countWrites(page, "export-search-status");
    await page.fill("#export-search", "stand");
    await page.fill("#export-search", "standa");
    assert.equal(await writes(page), 1, "typing more of the same finding does not have it said again");
  }, { extraTables: 5 }],

  ["Export: the description of a table is an element of its own, counted in tables, and written as the first line of its class", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Other_Table");
    assert.deepEqual(await offered(page, "export"), ["[x] Descriptions des tables (1 table)"]);
    assert.match(await generate(page), /\nclass Other_Table:\n {2}'Table liée, pour le choix des valeurs\.'\n {2}Label = grist\.Text\(\)\n/);

    await leaveOutElement(page, "export", "Descriptions des tables");
    assert.doesNotMatch(await generate(page), /Table liée/);
    assert.match(await generate(page), /\nclass Other_Table:\n {2}Label = grist\.Text\(\)\n/);

    await tick(page, "Existing_Table");
    assert.deepEqual((await offered(page, "export")).filter((item) => /Descriptions/.test(item)), ["[x] Descriptions des colonnes (1 colonne)", "[ ] Descriptions des tables (1 table)"], "the descriptions of the columns are another element, which the choice does not touch");
    assert.doesNotMatch(await generate(page), /Table liée/);
    assert.match(await generate(page), /description='Humeur du bénévole ce jour\.'/);
  }],

  ["Import: the description of a table is an element of its own, counted in tables, and written to the table once it is created", async (page, grist) => {
    await analyse(page, "@grist.UserTable\nclass Tasks:\n  'Les tâches à faire'\n  A = grist.Text()\n\n@grist.UserTable\nclass Done:\n  \"Les tâches faites\"\n  B = grist.Text()\n\n@grist.UserTable\nclass Plain:\n  C = grist.Text()\n");
    assert.deepEqual(await offered(page, "import"), ["[x] Descriptions des tables (2 tables)"]);
    assert.deepEqual(await warnings(page), [], "the string that opens a class is understood");
    await page.locator("#table-multi-select input").nth(1).uncheck();
    assert.deepEqual(await offered(page, "import"), ["[x] Descriptions des tables (1 table)"], "the tables ticked");
    await page.locator("#table-multi-select input").nth(1).check();

    await apply(page);
    assert.deepEqual(grist.calls[1], [["UpdateRecord", "_grist_Views_section", 105, { description: "Les tâches à faire" }], ["UpdateRecord", "_grist_Views_section", 106, { description: "Les tâches faites" }]]);
  }],

  ["Import: with the descriptions of the tables left out, no table is given one", async (page, grist) => {
    await analyse(page, "@grist.UserTable\nclass Tasks:\n  'Les tâches à faire'\n  A = grist.Text()\n");
    await leaveOutElement(page, "import", "Descriptions des tables");
    await apply(page);
    assert.equal(grist.calls.length, 1, "nothing to add once the table is created");
  }],

  ["Import: the table that receives columns keeps its own description: the one of the text is not offered", async (page, grist) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  'La table du texte'\n  Fresh = grist.Text()\n");
    assert.deepEqual(await offered(page, "import"), ["[x] Descriptions des tables (1 table)"]);
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Other_Table" });
    assert.equal(await hidden(page, "import-elements"), true, "nothing else in the text, and a table already there is not modified");
    await apply(page);
    assert.deepEqual(grist.calls.flat().map(([name]) => name), ["AddVisibleColumn"]);
  }],

  ["Import and Export: each element says what it is under its name, and the box is described by it", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await textOf(page, "#import-elements-list-options-hint"), "Alignement, formats de nombre et de date, couleurs…");
    assert.equal(await textOf(page, "#import-elements-list-displayColumns-hint"), "Quelle colonne de la table liée la cellule d’une référence affiche.");
    assert.equal(await description(page, "#import-elements-list li:not([hidden]) input[aria-labelledby^='import-elements-list-options-name']"), "Alignement, formats de nombre et de date, couleurs…");

    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    assert.equal(await textOf(page, "#export-elements-list-options-hint"), "Alignement, formats de nombre et de date, couleurs…");
    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.equal(await textOf(page, "#export-elements-list-displayColumns-hint"), "Which column of the linked table a reference cell shows.");
    assert.equal(await textOf(page, "#export-elements-list-options-name"), "Cell format");
  }],

  ["Export: a failed copy says what to do instead, in a message of its own", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Standalone_Table");
    await generate(page);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }));
    await page.click("#copy-btn");
    await page.waitForSelector("#copy-status.status-info");
    assert.match(await page.textContent("#copy-status"), /Ctrl\+C/);
  }],

  ["Export: while the code is generated, ticking a table does not allow a second generation", async (page, grist) => {
    await page.click("#tab-export");
    await tick(page, "Standalone_Table");
    slowFetch(grist);
    await page.click("#generate-btn");
    await page.locator("#export-table-list li", { hasText: "Other_Table" }).locator("input").check();
    assert.equal(await page.isDisabled("#generate-btn"), true, "while it runs");
    assert.equal(await page.isDisabled("#refresh-tables-btn"), true);
    await page.waitForSelector("#export-output-block:not([hidden])");
    assert.equal(await page.isDisabled("#generate-btn"), false);
  }],

  ["Export: the code is brought into view, and stays there once the button has its focus back", async (page) => {
    await page.setViewportSize({ width: 600, height: 500 });
    await page.click("#tab-export");
    await tick(page, "Standalone_Table");
    await generate(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), "generate-btn");
    assert.ok((await page.evaluate(() => document.getElementById("export-output-block").getBoundingClientRect().top)) < 100);
  }],

  ["Export: when the banner's buttons go, the keyboard goes on to Générer", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.click("#refs-include-btn");
    assert.equal(await page.evaluate(() => document.activeElement.id), "generate-btn");
    await page.locator("#export-table-list li", { hasText: "Other_Table" }).locator("input").uncheck();
    await page.click("#refs-dismiss-btn");
    assert.equal(await page.evaluate(() => document.activeElement.id), "generate-btn");
  }],

  ["Export: when the banner stays after its button was pressed, the keyboard stays on that button", async (page, grist) => {
    const fetchTable = grist.docApi.fetchTable;
    grist.docApi.fetchTable = async (name) => {
      const data = await fetchTable(name);
      if (name !== "_grist_Tables_column") return data;
      const link = { id: 11, parentId: 2, colId: "Link", type: "Ref:Standalone_Table", isFormula: false, formula: "", parentPos: 3, label: "Link", description: "", widgetOptions: "", visibleCol: 0 };
      return Object.fromEntries(Object.entries(data).map(([key, values]) => [key, [...values, link[key]]]));
    };
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.click("#refs-include-btn");
    assert.equal(await hidden(page, "export-refs-banner"), false, "Other_Table refers to Standalone_Table in turn");
    assert.equal(await page.evaluate(() => document.activeElement.id), "refs-include-btn");
    await page.click("#refs-include-btn");
    assert.equal(await page.evaluate(() => document.activeElement.id), "generate-btn");
  }],

  ["Export: a tick that changes nothing in the banner does not have a screen reader say it again", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await countWrites(page, "export-announcement");
    await page.locator("#export-table-list li", { hasText: "Standalone_Table" }).locator("input").check();
    await page.waitForTimeout(50);
    assert.equal(await writes(page), 0);
  }],

  ["Import: Analyser has the keyboard back once the document has been read", async (page) => {
    await analyse(page, MULTI);
    assert.equal(await page.evaluate(() => document.activeElement.id), "analyze-btn");
  }],

  ["Import: while the document is read again, the button of the previous analysis cannot be pressed", async (page, grist) => {
    await analyse(page, MULTI);
    slowFetch(grist);
    await page.click("#analyze-btn");
    assert.equal(await page.isDisabled("#action-btn"), true);
    await page.waitForFunction(() => !document.getElementById("analyze-btn").disabled);
    assert.equal(await page.isDisabled("#action-btn"), false);
  }],

  ["Import: once the columns are added, nothing is left to press and the keyboard goes back to the text", async (page, grist) => {
    const fetchTable = grist.docApi.fetchTable;
    grist.docApi.fetchTable = async (name) => {
      const data = await fetchTable(name);
      if (name !== "_grist_Tables_column" || grist.calls.length === 0) return data;
      const fresh = { id: 11, parentId: 1, colId: "Fresh", type: "Text", isFormula: false, formula: "", parentPos: 7, label: "Fresh", description: "", widgetOptions: "", visibleCol: 0 };
      return Object.fromEntries(Object.entries(data).map(([key, values]) => [key, [...values, fresh[key]]]));
    };
    await analyse(page, "@grist.UserTable\nclass X:\n  Fresh = grist.Text()\n");
    await page.click('label.segmented-option:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    await apply(page);
    assert.equal(await page.isDisabled("#action-btn"), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), "source-input");
  }],

  ["Focus: a button disabled a moment ago may still hold the keyboard, which is given on all the same", async (page) => {
    const holder = await page.evaluate(async () => {
      const { restoreFocus } = await import("/js/dom.js");
      const button = document.getElementById("analyze-btn");
      button.focus(); // where some browsers leave the focus of a button just disabled, until their next frame
      restoreFocus(document.getElementById("source-input"), button);
      return document.activeElement.id;
    });
    assert.equal(holder, "source-input");
  }],

  ["Import: once the table is created, the keyboard goes back to the text, since the button is gone", async (page) => {
    await analyse(page, MULTI);
    await apply(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), "source-input");
  }],

  ["Accessibility: the settings dialog and the preview table have a name", async (page) => {
    await page.click("#settings-btn");
    assert.equal(await page.getByRole("dialog", { name: "Réglages" }).count(), 1);
    await page.click("#settings-close-btn");
    await analyse(page, MULTI);
    assert.equal(await page.getByRole("table", { name: /Vérification/ }).count(), 1);
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

  ["Import: the description a table will have is shown under the field of its id, for as long as that element is kept", async (page) => {
    await analyse(page, "@grist.UserTable\nclass Tasks:\n  'Les tâches à faire'\n  A = grist.Text()\n\n@grist.UserTable\nclass Done:\n  \"Les tâches <b>faites</b>\"\n  B = grist.Text()\n\n@grist.UserTable\nclass Plain:\n  C = grist.Text()\n");
    const lines = () => page.$$eval("#table-ids-list .table-description", (items) => items.map((item) => [item.hidden, item.textContent]));
    assert.deepEqual(await lines(), [[false, "Les tâches à faire"], [false, "Les tâches <b>faites</b>"], [true, ""]], "what the code says, as text, and nothing for a table without");
    assert.equal(await count(page, "#table-ids-list .table-description b"), 0, "never markup");
    assert.equal((await description(page, "#table-id-0")).trim(), "Les tâches à faire", "read with the field");

    await leaveOutElement(page, "import", "Descriptions des tables");
    assert.deepEqual(await lines(), [[true, ""], [true, ""], [true, ""]], "a description that will not be written is not shown");
    await keepElement(page, "import", "Descriptions des tables");
    assert.equal((await lines())[0][1], "Les tâches à faire");

    await page.locator("#table-multi-select input").nth(0).uncheck();
    assert.deepEqual(await lines(), [[false, "Les tâches <b>faites</b>"], [true, ""]], "the tables that stay ticked");
    await page.click('label.segmented-option:has(input[value="existing"])');
    assert.equal(await hidden(page, "table-id-row"), true, "a table that receives columns is not given a description");
  }],

  ["Réglages: the only things the widget keeps in the browser are the theme and the language, and only once the user chose them", async (page) => {
    const kept = () =>
      page.evaluate(async () => ({
        local: Object.fromEntries(Object.entries(localStorage)),
        session: sessionStorage.length,
        cookie: document.cookie,
        databases: (await indexedDB.databases()).length,
      }));
    await analyse(page, TYPES);
    await apply(page);
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await generate(page);
    assert.deepEqual(await kept(), { local: {}, session: 0, cookie: "", databases: 0 }, "an import and an export keep nothing");

    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="dark"])');
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.deepEqual(await kept(), { local: { "gristFactory.theme": "dark", "gristFactory.locale": "en" }, session: 0, cookie: "", databases: 0 }, "the two choices, and what they chose");
  }],

  ["Import: the elements are folded, and what is chosen is written on their summary", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    const folded = () => page.evaluate(() => !document.getElementById("import-elements").open);
    assert.equal(await folded(), true, "folded until asked");
    assert.equal(await textOf(page, "#import-elements-state"), "Sans formules", "the formulas are left out until the user asks for them");

    await keepElement(page, "import", "Formules");
    assert.equal(await folded(), false, "unfolded to reach the box");
    assert.equal(await textOf(page, "#import-elements-state"), "Tous");
    await leaveOutElement(page, "import", "Libellés");
    assert.equal(await textOf(page, "#import-elements-state"), "Sans libellés");
    await leaveOutElement(page, "import", "Listes de choix");
    assert.equal(await textOf(page, "#import-elements-state"), "Sans libellés, listes de choix", "two left out are named");
    await leaveOutElement(page, "import", "Format des cellules");
    assert.equal(await textOf(page, "#import-elements-state"), "4 sur 7", "more are counted");
    for (const name of EVERY_ELEMENT) await leaveOutElement(page, "import", name);
    assert.equal(await textOf(page, "#import-elements-state"), "Aucun");

    await analyse(page, ALL_ELEMENTS);
    assert.equal(await folded(), false, "the group stays as the user left it");
    assert.equal(await textOf(page, "#import-elements-state"), "Sans formules");
  }],

  ["Import: the summary of the elements opens and closes with the keyboard, and the group is read only once it is open", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await page.focus("#import-elements summary");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.getElementById("import-elements").open), true);
    assert.equal(await page.getByRole("group", { name: "Éléments à importer" }).count(), 1);
    await page.keyboard.press("Space");
    assert.equal(await page.evaluate(() => document.getElementById("import-elements").open), false);
    assert.equal(await page.getByRole("group", { name: "Éléments à importer" }).count(), 0);
  }],

  ["Import: the summary of the elements speaks the language of the page", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await textOf(page, "#import-elements-state"), "Without formulas");
    await keepElement(page, "import", "Formulas");
    assert.equal(await textOf(page, "#import-elements-state"), "All");
    await leaveOutElement(page, "import", "Labels");
    await leaveOutElement(page, "import", "Choice lists");
    await leaveOutElement(page, "import", "Cell format");
    assert.equal(await textOf(page, "#import-elements-state"), "4 of 7");
    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="fr"])');
    assert.equal(await textOf(page, "#import-elements-state"), "4 sur 7", "written again with the language");
  }, { locale: "en" }],

  ["Export: the summary of the elements says what the export keeps", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    assert.equal(await page.evaluate(() => document.getElementById("export-elements").open), false, "folded until asked");
    assert.equal(await textOf(page, "#export-elements-state"), "Tous");
    await leaveOutElement(page, "export", "Formules");
    assert.equal(await textOf(page, "#export-elements-state"), "Sans formules");
    await page.click("#export-elements summary");
    assert.equal(await page.evaluate(() => document.getElementById("export-elements").open), false, "folded again by the user");
    assert.equal(await textOf(page, "#export-elements-state"), "Sans formules", "what is chosen does not depend on what is shown");
  }],

  ["Import: the mode is two options of a segmented control, and what it does is written under it", async (page) => {
    await analyse(page, TYPES);
    assert.equal(await page.getByRole("radiogroup", { name: /Que faire de ce code/ }).count(), 1);
    assert.equal(await count(page, '#mode-block input[name="import-mode"]'), 2);
    assert.equal(await textOf(page, "#mode-hint"), "Crée une table dédiée avec toutes les colonnes détectées. Recommandé.");
    assert.equal(await page.getByRole("radiogroup", { name: /Que faire de ce code/ }).getAttribute("aria-describedby"), "mode-hint");

    await page.focus('input[name="import-mode"][value="create"]');
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.isChecked('input[name="import-mode"][value="existing"]'), true, "the arrow keys move from one to the other");
    assert.equal(await textOf(page, "#mode-hint"), "Ajoute uniquement les colonnes qui manquent à une table de ce document.");
    assert.equal(await page.$eval('input[value="existing"]', (box) => box.closest("label").classList.contains("is-checked")), true);
    assert.equal(await page.$eval('input[value="create"]', (box) => box.closest("label").classList.contains("is-checked")), false);

    await page.click("#clear-btn");
    assert.equal(await page.isChecked('input[name="import-mode"][value="create"]'), true, "Effacer goes back to a new table");
    assert.equal(await page.$eval('input[value="create"]', (box) => box.closest("label").classList.contains("is-checked")), true, "and marks it");
    assert.equal(await page.$eval('input[value="existing"]', (box) => box.closest("label").classList.contains("is-checked")), false);
    await analyse(page, TYPES);
    assert.equal(await textOf(page, "#mode-hint"), "Crée une table dédiée avec toutes les colonnes détectées. Recommandé.");
  }],

  ["Import: the description of the mode follows the language", async (page) => {
    await analyse(page, TYPES);
    assert.equal(await textOf(page, "#mode-hint"), "Creates a dedicated table with every detected column. Recommended.");
    assert.equal(await page.getByRole("radiogroup", { name: "What to do with this code?" }).count(), 1);
    await page.click('label.segmented-option:has(input[value="existing"])');
    assert.equal(await textOf(page, "#mode-hint"), "Only adds the columns missing from a table of this document.");
  }, { locale: "en" }],

  ["Import: a code that is pasted is analysed at once, a typed one waits for Analyser", async (page) => {
    const paste = (text) =>
      page.evaluate((value) => {
        const box = document.getElementById("source-input");
        box.value = value;
        box.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste", bubbles: true }));
      }, text);
    await paste("@grist.UserTable\nclass Pasted:\n  A = grist.Text()\n");
    await page.waitForFunction(() => !document.getElementById("preview-section").hidden && !document.getElementById("analyze-btn").disabled);
    assert.equal(await page.inputValue("#table-ids-list input"), "Pasted", "the preview is there, with nobody having clicked");

    await page.fill("#source-input", "@grist.UserTable\nclass Typed:\n  B = grist.Text()\n");
    assert.equal(await hidden(page, "preview-section"), true, "typing takes the preview away and does not make another");

    await paste("   \n");
    assert.equal(await hidden(page, "preview-section"), true, "nothing pasted but blanks: nothing to analyse");
    await paste("@grist.UserTable\nclass Again:\n  C = grist.Text()\n");
    await page.waitForFunction(() => document.querySelector("#table-ids-list input")?.value === "Again");
  }],

  ["Export: the search is offered from seven tables, and the box that takes them all from two", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-search-row"), true, "three tables are read faster than a name is typed");
    assert.equal(await hidden(page, "export-select-all-row"), false);
    assert.deepEqual(await shownTables(page), ALL_TABLES);
  }],

  ["Export: seven tables have a search", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-search-row"), false);
    assert.equal((await shownTables(page)).length, 7);
  }, { extraTables: 4 }],

  ["Export: six tables have none", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-search-row"), true);
    assert.equal((await shownTables(page)).length, 6);
  }, { extraTables: 3 }],

  ["Export: a single table has neither a search nor a box for all", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-search-row"), true);
    assert.equal(await hidden(page, "export-select-all-row"), true);
    assert.deepEqual(await shownTables(page), ["Standalone_Table"]);
    assert.equal(await hidden(page, "export-tables-empty"), true);
  }, { onlyTables: ["Standalone_Table"] }],

  ["Export: two tables have a box for all, but no search", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-search-row"), true);
    assert.equal(await hidden(page, "export-select-all-row"), false);
    assert.deepEqual(await shownTables(page), ["Existing_Table", "Standalone_Table"]);
  }, { onlyTables: ["Existing_Table", "Standalone_Table"] }],

  ["Export: a search typed for a long list is gone once the list is short, so that it filters nothing out of sight", async (page, grist) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.fill("#export-search", "stand");
    assert.deepEqual(await shownTables(page), ["Standalone_Table"]);

    const read = grist.docApi.fetchTable;
    grist.docApi.fetchTable = async (name) => {
      const table = structuredClone(await read(name));
      if (name !== "_grist_Tables") return table;
      const kept = table.tableId.map((tableId) => !tableId.startsWith("Ledger_"));
      for (const key of Object.keys(table)) table[key] = table[key].filter((_, i) => kept[i]);
      return table;
    };
    await page.click("#refresh-tables-btn");
    await page.waitForFunction(() => !document.getElementById("refresh-tables-btn").disabled);
    assert.equal(await hidden(page, "export-search-row"), true);
    assert.equal(await page.inputValue("#export-search"), "");
    assert.deepEqual(await shownTables(page), ALL_TABLES);
  }, { extraTables: 5 }],

  ["Export: the columns of a table are chosen from its row, and a column left out is neither counted nor written", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    const row = page.locator("#export-table-list li", { hasText: "Existing_Table" });
    const toggle = row.locator(".columns-toggle");
    assert.equal(await count(page, "#export-table-list .columns-list label"), 0, "no box for a column until the choice is asked for");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await toggle.getAttribute("aria-label"), "Choisir les colonnes de Existing_Table");
    assert.equal(await toggle.getAttribute("title"), "Choisir les colonnes de Existing_Table");
    assert.equal(await hidden(page, "export-columns-0"), true);
    const listHeight = () => page.$eval("#export-table-list", (list) => getComputedStyle(list).maxHeight);
    assert.equal(await listHeight(), "260px", "a long list scrolls");

    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.equal(await listHeight(), "none", "but not through two boxes at once: the list grows with the columns it shows");
    const names = () => row.locator(".columns-list label").allTextContents();
    assert.deepEqual(await names(), ["Name", "Age", "Mood", "Owner", "Computed"], "the columns of Code View, in its order, without the hidden ones");
    assert.equal(await row.locator(".columns-list input:checked").count(), 5, "all kept");
    assert.equal(await page.getByRole("group", { name: "Colonnes de Existing_Table" }).count(), 1);
    assert.equal(await toggle.getAttribute("aria-controls"), "export-columns-0");

    await row.locator(".columns-list label", { hasText: "Age" }).locator("input").uncheck();
    await row.locator(".columns-list label", { hasText: "Computed" }).locator("input").uncheck();
    assert.equal(await textOf(page, "#export-table-list li .tag:not([hidden])"), "3 colonnes sur 5");
    assert.equal(await toggle.getAttribute("aria-label"), "Choisir les colonnes de Existing_Table, 3 colonnes sur 5");
    assert.equal(await tickedTablesBoxes(page), "Existing_Table", "the box of the table is not touched by those of its columns");
    assert.ok(!(await offered(page, "export")).some((item) => /Formules/.test(item)), "the formula that is left out is no longer offered");

    const code = await generate(page);
    assert.match(code, /class Existing_Table:\n {2}Name = grist\.Text\(\)\n {2}Mood = grist\.Choice\(/);
    assert.doesNotMatch(code, /Age|Computed/);
    assert.match(await textOf(page, "#export-status-region"), /1 table, 3 colonnes au total/, "what is said of the code counts what is in it");

    await row.locator(".columns-list label", { hasText: "Age" }).locator("input").check();
    assert.equal(await textOf(page, "#export-table-list li .tag:not([hidden])"), "4 colonnes sur 5");
    await row.locator(".columns-list label", { hasText: "Computed" }).locator("input").check();
    assert.equal(await count(page, "#export-table-list .tag:not([hidden])"), 0, "nothing left out: nothing said");
    assert.equal(await toggle.getAttribute("aria-label"), "Choisir les colonnes de Existing_Table");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await hidden(page, "export-columns-0"), true, "folded again");
    assert.equal(await listHeight(), "260px");
  }],

  ["Export: leaving out the reference to a table asks for nothing from it, and leaving out the column a reference shows takes the link with it", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    const open = async (tableId) => {
      const row = page.locator("#export-table-list li", { hasText: tableId });
      if ((await row.locator(".columns-toggle").getAttribute("aria-expanded")) === "false") await row.locator(".columns-toggle").click();
      return row;
    };
    assert.equal(await hidden(page, "export-refs-banner"), false, "Owner refers to Other_Table");
    const existing = await open("Existing_Table");
    await existing.locator(".columns-list label", { hasText: "Owner" }).locator("input").uncheck();
    assert.equal(await hidden(page, "export-refs-banner"), true, "no column refers to it any more");
    await existing.locator(".columns-list label", { hasText: "Owner" }).locator("input").check();
    assert.equal(await hidden(page, "export-refs-banner"), false, "back with the column");
    await page.click("#refs-include-btn");

    assert.match(await generate(page), /Owner = grist\.Reference\('Other_Table', visible_col='Label'\)/);
    assert.ok((await offered(page, "export")).some((item) => /Colonne affichée des références/.test(item)));
    const other = await open("Other_Table");
    await other.locator(".columns-list label", { hasText: "Label" }).locator("input").uncheck();
    assert.ok(!(await offered(page, "export")).some((item) => /Colonne affichée des références/.test(item)), "nothing shows that column any more");
    const code = await generate(page);
    assert.match(code, /Owner = grist\.Reference\('Other_Table'\)/, "the reference stays, plain");
    assert.doesNotMatch(code, /visible_col|Label/);
  }],

  ["Export: the columns left out stay when a table is unticked, when the list is read again and when the language changes", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    const row = () => page.locator("#export-table-list li", { hasText: "Existing_Table" });
    await row().locator(".columns-toggle").click();
    await row().locator(".columns-list label", { hasText: "Age" }).locator("input").uncheck();

    await row().locator("input.table-box").uncheck();
    await row().locator("input.table-box").check();
    assert.equal(await textOf(page, "#export-table-list li .tag:not([hidden])"), "4 colonnes sur 5", "a table unticked and ticked again");
    await page.check("#export-select-all");
    assert.equal(await textOf(page, "#export-table-list li .tag:not([hidden])"), "4 colonnes sur 5", "the box that takes all the tables takes no column");

    await page.click("#refresh-tables-btn");
    await page.waitForFunction(() => !document.getElementById("refresh-tables-btn").disabled);
    assert.equal(await row().locator(".columns-toggle").getAttribute("aria-expanded"), "false", "the list is made again");
    assert.equal(await textOf(page, "#export-table-list li .tag:not([hidden])"), "4 colonnes sur 5", "what was left out still is");
    await row().locator(".columns-toggle").click();
    assert.equal(await row().locator(".columns-list label", { hasText: "Age" }).locator("input").isChecked(), false);
    assert.doesNotMatch(await generate(page), /Age = grist/, "the formula of a column that stays still says $Age: a formula is never rewritten");

    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.equal(await textOf(page, "#export-table-list li .tag:not([hidden])"), "4 of 5 columns");
    assert.equal(await row().locator(".columns-toggle").getAttribute("aria-label"), "Choose the columns of Existing_Table, 4 of 5 columns");
    assert.equal(await page.getByRole("group", { name: "Columns of Existing_Table" }).count(), 1);
  }],

  ["Export: the boxes of the columns are not tables: they are not counted among the tables ticked that a search hides", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator(".columns-toggle").click();
    assert.equal(await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator(".columns-list input:checked").count(), 5);
    await page.fill("#export-search", "stand");
    assert.equal(await textOf(page, "#export-search-status"), "1 table affichée sur 8. 1 table cochée est masquée.");
    await page.check("#export-select-all");
    assert.deepEqual(await page.$$eval("#export-table-list input.table-box:checked", (boxes) => boxes.map((box) => box.value)), ["Existing_Table", "Standalone_Table"]);
    assert.equal(await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator(".columns-list input:checked").count(), 5, "the box that takes the tables shown takes no column");
    await page.fill("#export-search", "");
    await page.check("#export-select-all");
    await page.uncheck("#export-select-all");
    assert.equal(await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator(".columns-list input:checked").count(), 5, "nor does it leave one out");
    assert.equal(await page.isDisabled("#generate-btn"), true, "no table ticked: nothing to generate, whatever the columns say");
  }, { extraTables: 5 }],

  ["Export: the button of the columns comes right after the box of its table, and the boxes of the columns after the button", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    const focused = () => page.evaluate(() => (document.activeElement.className || document.activeElement.type) + ":" + (document.activeElement.closest("li")?.querySelector("span")?.textContent ?? ""));
    await page.focus("#export-table-list input.table-box");
    await page.keyboard.press("Tab");
    assert.equal(await focused(), "columns-toggle:Existing_Table");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.querySelector(".columns-toggle").getAttribute("aria-expanded")), "true");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.closest(".columns-list") !== null), true, "the first column");
    await page.keyboard.press("Space");
    assert.equal(await textOf(page, "#export-table-list li .tag:not([hidden])"), "4 colonnes sur 5", "a column left out with the keyboard");
  }],

  ["Accessibility: a long table id and the count of its columns do not make the screen scroll sideways at 320 px", async (page) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    const row = page.locator("#export-table-list li", { hasText: "Ledger_1" });
    await row.locator(".columns-toggle").click();
    assert.equal(await row.locator(".columns-list label").count(), 0, "a table without column has an empty group");
    const existing = page.locator("#export-table-list li", { hasText: "Existing_Table" });
    await existing.locator(".columns-toggle").click();
    await existing.locator(".columns-list label", { hasText: "Age" }).locator("input").uncheck();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    const sizes = await page.$$eval(".columns-toggle", (buttons) => buttons.map((button) => [button.offsetWidth, button.offsetHeight]));
    for (const [width, height] of sizes) assert.ok(width >= 24 && height >= 24, `${width} x ${height}`);
  }, { extraTables: 1 }],

  ["Accessibility: the icon buttons have a name and a tooltip, and keep them in the other language", async (page) => {
    const ICONS = [
      ["clear-btn", "Effacer", "Clear"],
      ["refresh-tables-btn", "Actualiser la liste", "Refresh the list"],
    ];
    for (const [id, fr] of ICONS) {
      assert.equal(await page.getAttribute(`#${id}`, "aria-label"), fr, id);
      assert.equal(await page.getAttribute(`#${id}`, "title"), fr, id);
      assert.equal(await page.$eval(`#${id}`, (button) => button.textContent.trim()), "", `${id} has no text: its icon is hidden from the readers`);
      assert.equal(await page.$eval(`#${id} svg`, (icon) => icon.getAttribute("aria-hidden")), "true", id);
    }
    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    for (const [id, , en] of ICONS) {
      assert.equal(await page.getAttribute(`#${id}`, "aria-label"), en, id);
      assert.equal(await page.getAttribute(`#${id}`, "title"), en, id);
    }
  }],

  ["Export: Copier le code is a labelled button, under the code and in sight once the code is there, in both languages", async (page) => {
    await page.setViewportSize({ width: 520, height: 640 });
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    assert.equal(await hidden(page, "export-output-block"), true, "nothing to copy before the code");
    await generate(page);

    const button = page.getByRole("button", { name: "Copier le code" });
    assert.equal(await button.count(), 1);
    assert.equal(await button.isVisible(), true);
    assert.equal(await textOf(page, "#copy-btn span"), "Copier le code", "the words, not an icon alone");
    assert.equal(await page.$eval("#copy-btn", (copy) => copy.classList.contains("btn-primary")), true, "the action of the step stands out");
    const [codeBottom, buttonTop, buttonBottom] = await page.evaluate(() => [
      document.getElementById("export-output").getBoundingClientRect().bottom,
      document.getElementById("copy-btn").getBoundingClientRect().top,
      document.getElementById("copy-btn").getBoundingClientRect().bottom,
    ]);
    assert.ok(buttonTop >= codeBottom, "under the code, as it always was");
    assert.ok(buttonBottom <= 640, `in sight in a pane of 640 px once the code is brought into view (it ends at ${buttonBottom} px)`);
    const [width, height] = await page.$eval("#copy-btn", (copy) => [copy.offsetWidth, copy.offsetHeight]);
    assert.ok(width >= 100 && height >= 32, `${width} x ${height}`);

    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.equal(await textOf(page, "#copy-btn span"), "Copy the code");
    assert.equal(await page.getByRole("button", { name: "Copy the code" }).count(), 1);
  }],

  ["Export: the copy button shows a tick for a moment once the code is copied", async (page) => {
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true }));
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await generate(page);
    const done = () => page.$eval("#copy-btn", (button) => button.classList.contains("is-done"));
    assert.equal(await done(), false);
    await page.click("#copy-btn");
    await page.waitForSelector("#copy-btn.is-done");
    assert.equal(await textOf(page, "#copy-status"), "Copié.");
    assert.equal(await page.$eval("#copy-btn .icon-done", (icon) => getComputedStyle(icon).display !== "none"), true, "the tick is shown");
    assert.equal(await page.$eval("#copy-btn .icon-copy", (icon) => getComputedStyle(icon).display), "none", "instead of the copy");
    await page.waitForFunction(() => !document.getElementById("copy-btn").classList.contains("is-done"), null, { timeout: 5000 });
    await page.click("#copy-btn");
    await page.waitForSelector("#copy-btn.is-done");
    await generate(page);
    assert.equal(await done(), false, "a new code starts without it");
    assert.equal(await textOf(page, "#copy-status"), "");
  }],

  ["Import: a code pasted while the tables are being created is left for later: the creation is not disturbed", async (page) => {
    await analyse(page, TYPES);
    await page.click("#action-btn");
    await page.click("#confirm-ok-btn");
    await page.evaluate(() => {
      const box = document.getElementById("source-input");
      box.value = "@grist.UserTable\nclass Later:\n  A = grist.Text()\n";
      box.dispatchEvent(new InputEvent("input", { inputType: "insertFromPaste", bubbles: true }));
    });
    await page.waitForTimeout(150);
    assert.equal(await page.isDisabled("#analyze-btn"), true, "an analysis would give back the button that the creation took");
    await page.waitForSelector("#import-status-region .status-success");
    assert.equal(await page.isDisabled("#analyze-btn"), false);
  }, { delay: 600 }],

  ["Accessibility: what takes the focus is never hidden under the bar of the action", async (page) => {
    await page.setViewportSize({ width: 520, height: 560 });
    await analyse(page, ALL_ELEMENTS);
    await unfold(page, "import");
    const last = page.locator("#import-elements-list li:not([hidden]) input").last();
    await last.evaluate((box) => window.scrollBy(0, box.getBoundingClientRect().bottom - (innerHeight - 20))); // it ends 20 px above the bottom of the pane, where the bar is
    await last.focus();
    const [bottom, barTop] = await last.evaluate((box) => [box.getBoundingClientRect().bottom, document.getElementById("create-actions").getBoundingClientRect().top]);
    assert.ok(bottom <= barTop, `the box ends at ${bottom} px, under the bar that starts at ${barTop} px`);
  }],

  ["the action of a block stays in reach: Générer le code is in view on a tall list, and in the flow on a very short pane", async (page) => {
    await page.setViewportSize({ width: 600, height: 560 });
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await page.$eval("#generate-btn", (button) => getComputedStyle(button.parentElement).position), "sticky");
    const bottom = await page.$eval("#generate-btn", (button) => button.getBoundingClientRect().bottom);
    assert.ok(bottom <= 560, `the button ends at ${bottom} px of a 560 px pane, whatever the scroll`);

    await page.setViewportSize({ width: 600, height: 400 });
    assert.equal(await page.$eval("#generate-btn", (button) => getComputedStyle(button.parentElement).position), "static", "a pane this short is not shared with a bar");
  }, { extraTables: 20 }],
];

const widget = await launchWidget();
after(() => widget.close());

test("the saved theme and language apply before any module has run", async () => {
  const page = await widget.browser.newPage();
  await page.route("**/js/app.js", (route) => route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("gristFactory.theme", "dark");
    localStorage.setItem("gristFactory.locale", "en");
  });
  await page.goto(widget.url);
  assert.deepEqual(await page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.lang]), ["dark", "en"]);
  await page.close();
});

test("a page without Grist's API says so in both tabs, and names the file that carries it", async () => {
  const page = await widget.browser.newPage();
  await page.goto(widget.url);
  assert.match(await textOf(page, "#import-status-region"), /grist-plugin-api\.js/);
  await page.click("#tab-export");
  assert.match(await textOf(page, "#export-status-region"), /grist-plugin-api\.js/);
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
  await stuck.route("**/js/app.js", (route) => route.abort());
  await stuck.addInitScript(() => localStorage.setItem("gristFactory.locale", "en"));
  await stuck.goto(widget.url);
  await stuck.evaluate(() => {
    document.body.style.animation = "none"; // set from the script: the page's CSP allows that, not a <style>
  });
  assert.equal(await stuck.evaluate(() => getComputedStyle(document.body).visibility), "hidden", "what the styles say, whatever the time taken to load");
  await stuck.evaluate(() => {
    document.body.style.animation = "";
  });
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
      await page.click('label.segmented-option:has(input[value="existing"])');
      await page.selectOption("#target-table-select", { label: "Existing_Table" });
    },
  ],
  [
    "the Export tab with its code",
    async (page) => {
      await page.click("#tab-export");
      await tick(page, "Existing_Table");
      await generate(page);
    },
  ],
  [
    "the Export tab searched for a table, with a ticked table that the search hides",
    async (page) => {
      await page.click("#tab-export");
      await tick(page, "Existing_Table");
      await page.fill("#export-search", "stand");
    },
  ],
  [
    "the Export tab searched for a table that is not there",
    async (page) => {
      await page.click("#tab-export");
      await page.waitForSelector("#export-table-list input");
      await page.fill("#export-search", "zzz");
    },
  ],
  [
    "the confirmation of the Import, with a warning about formulas",
    async (page, locale) => {
      await analyse(page, RICH_SOURCE);
      await keepElement(page, "import", locale === "en" ? "Formulas" : "Formules");
      await page.click("#action-btn");
    },
  ],
  [
    "the confirmation of the Import of columns into an existing table",
    async (page) => {
      await analyse(page, "@grist.UserTable\nclass X:\n  Name = grist.Text()\n  Fresh = grist.Int()\n"); // Fresh is not in Existing_Table: something to add
      await page.click('label.segmented-option:has(input[value="existing"])');
      await page.selectOption("#target-table-select", { label: "Existing_Table" });
      await page.click("#action-btn");
    },
  ],
  [
    "the Import preview with its elements unfolded",
    async (page) => {
      await analyse(page, RICH_SOURCE);
      await unfold(page, "import");
    },
  ],
  [
    "the Export tab with the columns of a table unfolded, one of them left out",
    async (page) => {
      await page.click("#tab-export");
      await tick(page, "Existing_Table");
      await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator(".columns-toggle").click();
      await page.locator("#export-table-list .columns-list label", { hasText: "Age" }).locator("input").uncheck();
    },
  ],
  [
    "the Export tab with its elements unfolded",
    async (page) => {
      await page.click("#tab-export");
      await tick(page, "Existing_Table");
      await unfold(page, "export");
    },
  ],
  ["the Réglages dialog", async (page) => page.click("#settings-btn")],
];

for (const theme of ["light", "dark"]) {
  for (const locale of ["fr", "en"]) {
    test(`axe-core finds nothing to fix on the main screens (${theme}, ${locale})`, async () => {
      for (const [name, setup] of SCREENS) {
        const page = await widget.open(fakeGrist({ extraTables: 5 }), { locale, bypassCSP: true });
        try {
          await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
          await setup(page, locale);
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
