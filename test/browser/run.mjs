/**
 * Interface checks: the real index.html in Chromium (Playwright, a dev-only
 * dependency never shipped), with an in-memory `grist` (fakeGrist.mjs), each check
 * on a fresh page. Behaviour against a real Grist is in test/grist.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { launchWidget } from "./widgetPage.mjs";
import { fakeGrist } from "./fakeGrist.mjs";
import { analyse, apply, choice, offered, previewRows, textOf, warnings } from "./driver.mjs";
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

const EVERY_ELEMENT = ["Libellés", "Descriptions", "Listes de choix", "Options d’affichage", "Colonnes d’affichage", "Liens bidirectionnels", "Formules"];

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
const ALL_TABLES = ["Existing_Table", "Other_Table", "Standalone_Table"];

/** Ticks a table of the Export tab, once its list is there. */
const tick = async (page, tableId) => {
  await page.waitForSelector("#export-table-list input");
  await page.locator("#export-table-list li", { hasText: tableId }).locator("input").check();
};

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

  ["Import: a column already in the table raises no note, since it is not imported", async (page) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Name = grist.Mystery()\n\n  @grist.formulaType(grist.Int())\n  def Computed(rec, table):\n    return 1\n  Fresh = grist.Text()\n");
    assert.equal((await warnings(page)).length, 2, "to create the table, both are noted");
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.deepEqual(await warnings(page), [], "Name and Computed are in Existing_Table already");
  }],

  ["Import: the formulas option goes with the tables, and is unticked at every analysis", async (page, grist) => {
    await analyse(page, WITH_FORMULA);
    assert.equal(await hidden(page, "import-elements"), false);
    await choice(page, "import", "Formules").check();
    await analyse(page, WITH_FORMULA);
    assert.equal(await choice(page, "import", "Formules").isChecked(), false, "what was decided for a text that is no longer there");
    await choice(page, "import", "Formules").check();
    await analyse(page, "nothing to read here");
    assert.equal(await hidden(page, "import-elements"), true);
    await analyse(page, WITH_FORMULA);
    assert.equal(await choice(page, "import", "Formules").isChecked(), false);
    await apply(page);
    assert.deepEqual(grist.calls[0][0][2].map((col) => [col.id, col.isFormula]), [["A", false], ["Double", false]]);
  }],

  ["Import: editing the text while the document is being read announces and shows nothing", async (page, grist) => {
    const fetchTable = grist.docApi.fetchTable;
    grist.docApi.fetchTable = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return fetchTable(...args);
    };
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
    await page.click('label.mode-card:has(input[value="existing"])');
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
    assert.equal(await page.getByRole("checkbox", { name: /Formules/ }).isChecked(), false);
    assert.match(await textOf(page, "#warnings-list"), /créées vides : Double/);
    assert.deepEqual(await previewRows(page), ["AEntier", "DoubleEntier formule"]);

    await choice(page, "import", "Formules").check();
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
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await hidden(page, "import-elements"), false);
    await choice(page, "import", "Formules").check();
    await apply(page);
    const added = grist.calls.flat().map(([name, , id, payload]) => [name, id, payload.isFormula, payload.formula]);
    assert.deepEqual(added, [["AddVisibleColumn", "Fresh", false, ""], ["AddVisibleColumn", "Double", true, "rec.A * 2"]]);
  }],

  ["Import: the elements offered are those the text really has, with how many columns carry each, all ticked but the formulas", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await hidden(page, "import-elements"), false);
    assert.deepEqual(await offered(page, "import"), [
      "[x] Libellés (1 colonne)",
      "[x] Descriptions (1 colonne)",
      "[x] Listes de choix (1 colonne)",
      "[x] Options d’affichage (1 colonne)",
      "[x] Colonnes d’affichage (1 colonne)",
      "[x] Liens bidirectionnels (2 colonnes)",
      "[ ] Formules (1 colonne)",
    ]);

    await analyse(page, "@grist.UserTable\nclass X:\n  A = grist.Text(label='Un')\n  B = grist.Text(label='Deux')\n");
    assert.deepEqual(await offered(page, "import"), ["[x] Libellés (2 colonnes)"], "nothing else is in the text");
    assert.equal(await hidden(page, "formulas-hint"), true, "the warning about formulas goes with them");

    await analyse(page, WITH_FORMULA);
    assert.equal(await hidden(page, "formulas-hint"), false);
    assert.equal(await choice(page, "import", "Formules").getAttribute("aria-describedby"), "formulas-hint");
  }],

  ["Import: the counts follow the tables and the columns that are ticked", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await page.locator("#table-multi-select input").nth(1).uncheck();
    assert.deepEqual(await offered(page, "import"), [
      "[x] Libellés (1 colonne)",
      "[x] Descriptions (1 colonne)",
      "[x] Listes de choix (1 colonne)",
      "[x] Options d’affichage (1 colonne)",
      "[ ] Formules (1 colonne)",
    ], "People is not created: Owner becomes Any, which shows no column and is linked to none");
    await page.locator("#table-multi-select input").nth(1).check();

    await page.locator("#columns-preview-body tr", { hasText: "Late" }).locator("input").uncheck();
    await page.locator("#columns-preview-body tr", { hasText: "Title" }).locator("input").uncheck();
    assert.deepEqual(await offered(page, "import"), [
      "[x] Listes de choix (1 colonne)",
      "[x] Options d’affichage (1 colonne)",
      "[x] Colonnes d’affichage (1 colonne)",
      "[x] Liens bidirectionnels (2 colonnes)",
    ], "neither the label nor the description, nor the formula, is left");

    await page.click("#columns-select-all"); // some were ticked: all are
    await page.click("#columns-select-all");
    assert.equal(await hidden(page, "import-elements"), true, "no column left, nothing to choose");
  }],

  ["Import: the choices made stay while the preview changes, and are made again at every analysis", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await choice(page, "import", "Libellés").uncheck();
    await choice(page, "import", "Formules").check();
    await page.locator("#table-multi-select input").nth(1).uncheck();
    await page.locator("#table-multi-select input").nth(1).check();
    assert.deepEqual((await offered(page, "import")).filter((item) => /Libellés|Formules/.test(item)), ["[ ] Libellés (1 colonne)", "[x] Formules (1 colonne)"]);

    await analyse(page, ALL_ELEMENTS);
    assert.deepEqual((await offered(page, "import")).filter((item) => /Libellés|Formules/.test(item)), ["[x] Libellés (1 colonne)", "[ ] Formules (1 colonne)"]);
  }],

  ["Import: an element left out is not created, and the others are", async (page, grist) => {
    await analyse(page, ALL_ELEMENTS);
    await choice(page, "import", "Listes de choix").uncheck();
    await choice(page, "import", "Libellés").uncheck();
    await apply(page);
    const [[, , tasks], [, , people]] = grist.calls[0];
    assert.deepEqual(tasks.map((col) => [col.id, col.label, col.widgetOptions && JSON.parse(col.widgetOptions)]), [["Title", "Title", undefined], ["Status", "Status", { alignment: "center" }], ["Owner", "Owner", undefined], ["Late", "Late", undefined]]);
    assert.deepEqual(people.map((col) => col.id), ["Name", "Tasks"]);
    const changes = grist.calls.slice(1).flat().filter(([name]) => name === "ModifyColumn").map(([, table, id, change]) => [table, id, Object.keys(change).sort()]);
    assert.deepEqual(changes, [["Tasks", "Title", ["description"]], ["Tasks", "Owner", ["reverseCol"]]], "the description is added, and the link is made; no id is untied, since there is no label left");
  }],

  ["Import: with every element left out, only the id and the type of each column are sent", async (page, grist) => {
    await analyse(page, ALL_ELEMENTS);
    for (const name of EVERY_ELEMENT.slice(0, 6)) await choice(page, "import", name).uncheck();
    assert.equal(await hidden(page, "warnings-block"), false, "the formulas are still said to be created empty");
    assert.equal(await page.getByText("Références bidirectionnelles créées comme références simples").count(), 0, "a link that was left out is no plain reference that was meant to be a link");
    await apply(page);
    assert.equal(grist.calls.length, 1, "nothing to add afterwards");
    const [[, , tasks]] = grist.calls[0];
    assert.deepEqual(tasks.map((col) => [col.id, col.type, col.label, col.widgetOptions]), [["Title", "Text", "Title", undefined], ["Status", "Choice", "Status", undefined], ["Owner", "Ref:People", "Owner", undefined], ["Late", "Int", "Late", undefined]]);
  }],

  ["Import: an existing table's elements are those of the columns that will be added", async (page) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Name = grist.Text(label='Nom')\n  Fresh = grist.Text(description='Neuve')\n");
    assert.deepEqual(await offered(page, "import"), ["[x] Libellés (1 colonne)", "[x] Descriptions (1 colonne)"]);
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.deepEqual(await offered(page, "import"), ["[x] Descriptions (1 colonne)"], "Name is in the table already: its label is not imported");
    await page.selectOption("#target-table-select", { label: "Standalone_Table" });
    assert.deepEqual(await offered(page, "import"), ["[x] Libellés (1 colonne)", "[x] Descriptions (1 colonne)"]);
  }],

  ["Import: the elements left out are not added to an existing table either", async (page, grist) => {
    await analyse(page, "@grist.UserTable\nclass X:\n  Fresh = grist.Choice(choices=['a'], label='Nouvelle', description='Une note', widget_options='{\"alignment\":\"center\"}')\n");
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    await choice(page, "import", "Listes de choix").uncheck();
    await choice(page, "import", "Libellés").uncheck();
    await apply(page);
    const [[[, , id, payload]], followUp] = grist.calls;
    assert.deepEqual([id, payload.label, JSON.parse(payload.widgetOptions)], ["Fresh", "Fresh", { alignment: "center" }]);
    assert.deepEqual(followUp, [["ModifyColumn", "Existing_Table", "Fresh", { description: "Une note" }]], "the description is added, and no id is untied since the label is left out");
  }],

  ["Import: a reference to a table that is nowhere offers neither its display column nor its link", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await page.locator("#table-multi-select input").nth(1).uncheck();
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Standalone_Table" });
    assert.deepEqual((await offered(page, "import")).filter((item) => /affichage|bidirectionnels/.test(item)), ["[x] Options d’affichage (1 colonne)"], "Owner became Any: it has neither");
  }],

  ["Import: the elements are named in the language of the page, and keep their ticks when it changes", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    await choice(page, "import", "Libellés").uncheck();
    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.deepEqual(await offered(page, "import"), [
      "[ ] Labels (1 column)",
      "[x] Descriptions (1 column)",
      "[x] Choice lists (1 column)",
      "[x] Display options (1 column)",
      "[x] Display columns (1 column)",
      "[x] Two-way links (2 columns)",
      "[ ] Formulas (1 column)",
    ]);
    assert.equal(await textOf(page, "#import-elements legend"), "Elements to import");
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
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await overflows(), false, "preview with every element");
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Existing_Table" });
    assert.equal(await overflows(), false, "existing table");
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
    await page.click("#generate-btn");
    await page.waitForSelector("#export-output-block:not([hidden])");
    assert.equal(await overflows(), false, "export");
    await page.fill("#export-search", "Very_long_".repeat(12));
    assert.equal(await overflows(), false, "a long search, said back");
  }],

  ["Accessibility: every checkbox of the preview is a target of at least 24 px, whatever its row", async (page) => {
    await analyse(page, MULTI);
    const sizes = await page.$$eval(".col-checkbox label", (labels) => labels.map((label) => [label.offsetWidth, label.offsetHeight]));
    assert.equal(sizes.length, 4, "the head and three columns");
    for (const [width, height] of sizes) assert.ok(width >= 24 && height >= 24, `${width} x ${height}`);

    await analyse(page, ALL_ELEMENTS);
    const boxes = await page.$$eval("#import-elements-list label", (labels) => labels.map((label) => [label.offsetWidth, label.offsetHeight]));
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

  ["Export: the elements offered are those of the tables ticked, with how many columns carry each, and all ticked", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-elements"), true, "no table, nothing to choose");
    await tick(page, "Standalone_Table");
    assert.equal(await hidden(page, "export-elements"), true, "this table has none of them");
    await tick(page, "Existing_Table");
    assert.deepEqual(await offered(page, "export"), [
      "[x] Libellés (1 colonne)",
      "[x] Descriptions (1 colonne)",
      "[x] Listes de choix (1 colonne)",
      "[x] Options d’affichage (1 colonne)",
      "[x] Colonnes d’affichage (1 colonne)",
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
    const WRITTEN = { Libellés: "label='Humeur'", Descriptions: "description='Humeur du bénévole ce jour.'", "Listes de choix": "choices=['Content (ok)'", "Options d’affichage": `"alignment":"center"`, "Colonnes d’affichage": "visible_col='Label'", Formules: "def Computed(rec, table)" };

    const everything = await generate();
    for (const [name, written] of Object.entries(WRITTEN)) assert.ok(everything.includes(written), `${name} is written by default`);

    await choice(page, "export", "Formules").uncheck();
    await choice(page, "export", "Colonnes d’affichage").uncheck();
    const text = await generate();
    for (const [name, written] of Object.entries(WRITTEN)) assert.equal(text.includes(written), !["Formules", "Colonnes d’affichage"].includes(name), name);
    assert.match(text, /\n {2}Computed = grist\.Numeric\(\)\n/, "the column is still there, as plain data");

    for (const name of Object.keys(WRITTEN)) await choice(page, "export", name).uncheck();
    assert.match(await generate(), /class Existing_Table:\n {2}Name = grist\.Text\(\)\n {2}Age = grist\.Int\(\)\n {2}Mood = grist\.Choice\(\)\n {2}Owner = grist\.Reference\('Other_Table'\)\n {2}Computed = grist\.Numeric\(\)\n/, "the types alone, the columns that were formulas last as in Code View");
  }],

  ["Export: the choices made stay when the tables ticked change, when the list is read again and when the language changes", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await choice(page, "export", "Formules").uncheck();
    await tick(page, "Standalone_Table");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").uncheck();
    assert.equal(await hidden(page, "export-elements"), true);
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
    await page.click("#refresh-tables-btn");
    await page.waitForFunction(() => !document.getElementById("refresh-tables-btn").disabled);
    assert.equal(await choice(page, "export", "Formules").isChecked(), false);
    assert.equal(await choice(page, "export", "Libellés").isChecked(), true);

    await page.click("#settings-btn");
    await page.click('label.segmented-option:has(input[value="en"])');
    assert.deepEqual((await offered(page, "export")).filter((item) => /Formulas|Labels/.test(item)), ["[x] Labels (1 column)", "[ ] Formulas (1 column)"]);
    assert.equal(await textOf(page, "#export-elements legend"), "Elements to export");
  }],

  ["Accessibility: each group is named, and each of its boxes says what it is and how many columns carry it", async (page) => {
    await analyse(page, ALL_ELEMENTS);
    assert.equal(await page.getByRole("group", { name: "Éléments à importer" }).count(), 1);
    assert.equal(await page.getByRole("checkbox", { name: /^Liens bidirectionnels 2 colonnes$/ }).count(), 1);
    assert.equal(await textOf(page, "#import-elements-list li:nth-child(6) label"), "Liens bidirectionnels 2 colonnes", "in the text itself, for the readers that put the words of a label end to end");
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    assert.equal(await page.getByRole("group", { name: "Éléments à exporter" }).count(), 1);
    assert.equal(await page.getByRole("checkbox", { name: /^Listes de choix 1 colonne$/ }).count(), 1);
  }],

  ["Export: typing a name narrows the list as it is typed, whatever the case or the order of the words", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await hidden(page, "export-search-row"), false);
    assert.deepEqual(await shownTables(page), ALL_TABLES);
    assert.equal(await textOf(page, "#export-search-status"), "", "nothing is said about a search that is not made");

    await page.fill("#export-search", "stand");
    assert.deepEqual(await shownTables(page), ["Standalone_Table"]);
    assert.equal(await textOf(page, "#export-search-status"), "1 table affichée sur 3.");
    await page.fill("#export-search", "OTHER");
    assert.deepEqual(await shownTables(page), ["Other_Table"]);
    await page.fill("#export-search", "table ex");
    assert.deepEqual(await shownTables(page), ["Existing_Table"], "the words in any order");
    await page.fill("#export-search", "_t");
    assert.deepEqual(await shownTables(page), ALL_TABLES);
    assert.equal(await textOf(page, "#export-search-status"), "3 tables affichées sur 3.");
    await page.fill("#export-search", "");
    assert.deepEqual(await shownTables(page), ALL_TABLES);
    assert.equal(await textOf(page, "#export-search-status"), "");
  }],

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
    assert.deepEqual(await shownTables(page), ALL_TABLES);
    assert.equal(await page.isDisabled("#export-select-all"), false);

    await page.fill("#export-search", "stand");
    await page.press("#export-search", "Escape");
    assert.equal(await page.inputValue("#export-search"), "", "and the key itself");
  }],

  ["Export: the tables ticked that a search hides stay ticked, are said, and are exported; the box on top ticks only what is shown", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.fill("#export-search", "stand");
    assert.equal(await textOf(page, "#export-search-status"), "1 table affichée sur 3. 1 table cochée est masquée.");
    assert.equal(await textOf(page, "#export-select-all-text"), "Cocher les tables affichées");

    await page.check("#export-select-all");
    assert.deepEqual(await tickedTables(page), ["Existing_Table", "Standalone_Table"], "Other_Table, which is hidden, is not ticked with them");
    assert.equal(await page.isChecked("#export-select-all"), true, "all that is shown is ticked");
    await page.uncheck("#export-select-all");
    assert.deepEqual(await tickedTables(page), ["Existing_Table"], "nor is Existing_Table unticked, which is hidden");

    await page.check("#export-select-all");
    await page.click("#generate-btn");
    await page.waitForSelector("#export-output-block:not([hidden])");
    const code = await page.inputValue("#export-output");
    assert.deepEqual(["class Existing_Table", "class Standalone_Table", "class Other_Table"].map((text) => code.includes(text)), [true, true, false]);

    await page.fill("#export-search", "");
    assert.equal(await textOf(page, "#export-select-all-text"), "Tout cocher");
    assert.equal(await page.evaluate(() => document.getElementById("export-select-all").indeterminate), true, "two of three");
  }],

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
    assert.equal(await textOf(page, "#export-search-status"), "1 table shown of 3.");
    assert.equal(await textOf(page, "#export-select-all-text"), "Select the tables shown");
    assert.equal(await page.getAttribute("#export-search", "placeholder"), "Search tables…");
    await page.click("#settings-close-btn");
    await page.fill("#export-search", "zzz");
    assert.equal(await textOf(page, "#export-search-status"), "No table matches “zzz”.");
  }],

  ["Export: the tables the banner asks to include are shown, whatever was searched", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.fill("#export-search", "exist");
    assert.deepEqual(await shownTables(page), ["Existing_Table"]);
    await page.click("#refs-include-btn");
    assert.equal(await page.inputValue("#export-search"), "", "Other_Table, just ticked, was hidden");
    assert.deepEqual(await shownTables(page), ALL_TABLES);
    assert.deepEqual(await tickedTables(page), ["Existing_Table", "Other_Table"]);
  }],

  ["Export: a search that shows the tables included keeps what was typed", async (page) => {
    await page.click("#tab-export");
    await tick(page, "Existing_Table");
    await page.fill("#export-search", "table");
    await page.click("#refs-include-btn");
    assert.equal(await page.inputValue("#export-search"), "table");
    assert.deepEqual(await tickedTables(page), ["Existing_Table", "Other_Table"]);
  }],

  ["Export: what a search writes is text, never markup, and has no effect on the page", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.fill("#export-search", "<img src=x onerror=alert(1)>");
    assert.equal(await textOf(page, "#export-search-status"), "Aucune table ne correspond à « <img src=x onerror=alert(1)> ».");
    assert.equal(await count(page, "#export-search-status img"), 0);
  }],

  ["Accessibility: the search field has a name, and its result is announced", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    assert.equal(await page.getByRole("searchbox", { name: "Rechercher une table" }).count(), 1);
    assert.equal(await page.getAttribute("#export-search-status", "aria-live"), "polite");
    await page.evaluate(() => {
      window.writes = 0;
      new MutationObserver((records) => (window.writes += records.length)).observe(document.getElementById("export-search-status"), { childList: true, characterData: true, subtree: true });
    });
    await page.fill("#export-search", "stand");
    await page.fill("#export-search", "standa");
    assert.equal(await page.evaluate(() => window.writes), 1, "typing more of the same finding does not have it said again");
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

  ["Export: while the code is generated, ticking a table does not allow a second generation", async (page, grist) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Standalone_Table" }).locator("input").check();
    const fetchTable = grist.docApi.fetchTable;
    grist.docApi.fetchTable = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return fetchTable(...args);
    };
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
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Standalone_Table" }).locator("input").check();
    await page.click("#generate-btn");
    await page.waitForSelector("#export-output-block:not([hidden])");
    assert.equal(await page.evaluate(() => document.activeElement.id), "generate-btn");
    assert.ok((await page.evaluate(() => document.getElementById("export-output-block").getBoundingClientRect().top)) < 100);
  }],

  ["Export: when the banner's buttons go, the keyboard goes on to Générer", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
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
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
    await page.click("#refs-include-btn");
    assert.equal(await hidden(page, "export-refs-banner"), false, "Other_Table refers to Standalone_Table in turn");
    assert.equal(await page.evaluate(() => document.activeElement.id), "refs-include-btn");
    await page.click("#refs-include-btn");
    assert.equal(await page.evaluate(() => document.activeElement.id), "generate-btn");
  }],

  ["Export: a tick that changes nothing in the banner does not have a screen reader say it again", async (page) => {
    await page.click("#tab-export");
    await page.waitForSelector("#export-table-list input");
    await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
    await page.evaluate(() => {
      window.writes = 0;
      new MutationObserver((records) => (window.writes += records.length)).observe(document.getElementById("export-announcement"), { childList: true, characterData: true, subtree: true });
    });
    await page.locator("#export-table-list li", { hasText: "Standalone_Table" }).locator("input").check();
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.writes), 0);
  }],

  ["Import: Analyser has the keyboard back once the document has been read", async (page) => {
    await analyse(page, MULTI);
    assert.equal(await page.evaluate(() => document.activeElement.id), "analyze-btn");
  }],

  ["Import: while the document is read again, the button of the previous analysis cannot be pressed", async (page, grist) => {
    await analyse(page, MULTI);
    const fetchTable = grist.docApi.fetchTable;
    grist.docApi.fetchTable = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return fetchTable(...args);
    };
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
    await page.click('label.mode-card:has(input[value="existing"])');
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
  [
    "the Export tab searched for a table, with a ticked table that the search hides",
    async (page) => {
      await page.click("#tab-export");
      await page.waitForSelector("#export-table-list input");
      await page.locator("#export-table-list li", { hasText: "Existing_Table" }).locator("input").check();
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
