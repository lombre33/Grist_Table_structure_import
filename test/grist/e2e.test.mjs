/** The real index.html in Chromium, wired to a real Grist document through the REST bridge. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { launchWidget } from "../browser/widgetPage.mjs";
import { analyse, apply, previewRows, warnings } from "../browser/driver.mjs";
import { instance, column, addTable, snapshot } from "./support.mjs";

const widget = await launchWidget();
after(() => widget.close());

async function inWidget(check, options) {
  const doc = await instance.newDoc("e2e");
  const page = await widget.open(doc.grist, options);
  try {
    await check(page, doc);
    assert.deepEqual(page.problems, [], "console error, page error or CSP violation");
  } finally {
    await page.close();
  }
}

const idInput = (page, position) => page.locator("#table-ids-list .table-id-entry input").nth(position);
const ids = async (doc) => (await doc.tableIds()).filter((id) => id !== "Table1");

const PEOPLE_AND_PETS = `
@grist.UserTable
class People:
  Name = grist.Text()

@grist.UserTable
class Pets:
  Owner = grist.Reference('People')
  Friends = grist.ReferenceList('People')
`;

test("two linked tables are created together with their references", () =>
  inWidget(async (page, doc) => {
    await analyse(page, PEOPLE_AND_PETS);
    assert.deepEqual(await warnings(page), []);
    assert.equal(await apply(page), "2 tables créées (People, Pets), 3 colonnes au total.");
    assert.deepEqual((await snapshot(doc)).Pets.map((col) => col.type), ["Ref:People", "RefList:People"]);
    assert.equal(await page.isHidden("#preview-section"), true, "done: no form left that contradicts the success message");
  }));

test("with every column unticked there is nothing to create", () =>
  inWidget(async (page) => {
    await analyse(page, "@grist.UserTable\nclass Only:\n  A = grist.Text()\n");
    await page.locator("#columns-preview-body input").uncheck();
    assert.equal(await page.isDisabled("#action-btn"), true);
  }));

test("renaming the target table re-points the references", () =>
  inWidget(async (page, doc) => {
    await analyse(page, PEOPLE_AND_PETS);
    await idInput(page, 0).fill("Persons");
    assert.match(await apply(page), /Persons, Pets/);
    assert.deepEqual((await snapshot(doc)).Pets.map((col) => col.type), ["Ref:Persons", "RefList:Persons"]);
  }));

test("a table id is proposed capitalised, and only ids Grist keeps are accepted", () =>
  inWidget(async (page, doc) => {
    await analyse(page, "@grist.UserTable\nclass clients:\n  Name = grist.Text(description='la desc')\n");
    assert.equal(await idInput(page, 0).inputValue(), "Clients");

    await idInput(page, 0).fill("clients");
    assert.match(await page.textContent(".field-error:not([hidden])"), /majuscule/);
    assert.equal(await page.isDisabled("#action-btn"), true);

    await idInput(page, 0).fill("Clients");
    assert.equal(await apply(page), "Table « Clients » créée avec 1 colonne.");
    assert.deepEqual((await snapshot(doc)).Clients.map((col) => col.description), ["la desc"]);
  }));

test("a table that exists already, whatever the case, blocks the creation until renamed", () =>
  inWidget(async (page, doc) => {
    await analyse(page, "@grist.UserTable\nclass table1:\n  Name = grist.Text()\n");
    assert.match(await page.textContent(".field-error:not([hidden])"), /existe déjà/);
    assert.equal(await page.isDisabled("#action-btn"), true);

    await idInput(page, 0).fill("Fresh");
    await apply(page);
    assert.deepEqual(await ids(doc), ["Fresh"]);
  }));

test("a table created meanwhile is caught when applying, nothing is created", () =>
  inWidget(async (page, doc) => {
    await analyse(page, "@grist.UserTable\nclass Late:\n  Name = grist.Text()\n");
    await addTable(doc, "LATE", [column("A")]);
    assert.match(await apply(page), /Échec de la création : Cette table existe déjà dans ce document : Late/);
    assert.deepEqual(await ids(doc), ["LATE"]);
    page.problems.length = 0; // the failure is logged to the console on purpose
  }));

test("an engine error is reported and leaves the document untouched", () =>
  inWidget(async (page, doc) => {
    await analyse(page, "@grist.UserTable\nclass Broken:\n  grist = grist.Text()\n  Other = grist.Text()\n");
    assert.match(await apply(page), /^Échec de la création : .*Sandbox/);
    assert.deepEqual(await ids(doc), []);
    assert.equal(await page.isDisabled("#analyze-btn"), false, "the form is usable again");
    page.problems.length = 0;
  }));

test("descriptions and display columns are applied, multi-line descriptions included", () =>
  inWidget(async (page, doc) => {
    await analyse(page, `
@grist.UserTable
class Teams:
  Title = grist.Text(description='line 1\\nline 2')

@grist.UserTable
class Members:
  Team = grist.Reference('Teams', visible_col='Title')
  After = grist.Text()
`);
    assert.equal(await page.locator("#columns-preview-body tr").count(), 5, "two table separators and three columns");
    assert.match(await apply(page), /^2 tables créées \(Teams, Members\), 3 colonnes au total\.$/);
    const after = await snapshot(doc);
    assert.deepEqual(after.Teams.map((col) => col.description), ["line 1\nline 2"]);
    assert.deepEqual(after.Members.map((col) => [col.id, col.visibleCol]), [["Team", "Title"], ["After", null]]);
  }));

test("Export then Import through the interface keeps what Grist drops on its own", async () => {
  const source = await instance.newDoc("e2e source");
  await source.apply([
    ["AddTable", "Teams", [column("Title", "Text", { label: "Intitulé" })]],
    ["AddTable", "Members", [column("Team", "Ref:Teams"), column("Mood", "Choice", { widgetOptions: JSON.stringify({ choices: ["a'b", 'c"d', "Content (ok)"], alignment: "center" }) })]],
  ]);
  await source.apply([["ModifyColumn", "Members", "Mood", { description: "Humeur\ndu jour" }]]);

  const exporter = await widget.open(source.grist);
  await exporter.click("#tab-export");
  await exporter.locator("#export-table-list li", { hasText: "Members" }).locator("input").check();
  await exporter.click("#refs-include-btn");
  await exporter.click("#generate-btn");
  await exporter.waitForFunction(() => document.getElementById("export-output").value.includes("class Members"));
  const text = await exporter.inputValue("#export-output");
  await exporter.close();

  await inWidget(async (page, target) => {
    await analyse(page, text);
    await apply(page);
    const expected = await snapshot(source);
    const imported = await snapshot(target);
    assert.deepEqual(imported.Members, expected.Members);
    assert.deepEqual(imported.Teams, expected.Teams);
    assert.equal(imported.Members[1].description, "Humeur\ndu jour");
  });
});

test("an existing table: columns are matched ignoring case, and only the new ones are added", () =>
  inWidget(async (page, doc) => {
    await addTable(doc, "Contacts", [column("Name"), column("Email")]);
    await analyse(page, "@grist.UserTable\nclass X:\n  name = grist.Text()\n  Age = grist.Int(description='Years')\n  EMAIL = grist.Text()\n");
    await page.click('label.mode-card:has(input[value="existing"])');
    await page.selectOption("#target-table-select", { label: "Contacts" });
    assert.deepEqual(await previewRows(page), ["nameTexteDéjà présente", "AgeEntierNouvelle", "EMAILTexteDéjà présente"]);

    assert.equal(await apply(page), "1 colonne ajoutée à « Contacts ».");
    const [, , age] = (await snapshot(doc)).Contacts;
    assert.deepEqual([age.id, age.description], ["Age", "Years"]);
    assert.equal(await page.isDisabled("#action-btn"), true, "nothing left to add");
  }));

test("hand-written ids that Grist rewrites still get their description", () =>
  inWidget(async (page, doc) => {
    await analyse(page, "@grist.UserTable\nclass Hand:\n  _x = grist.Text(description='kept')\n  a = grist.Text()\n  A = grist.Text()\n");
    assert.match(await apply(page), /^Table « Hand » créée avec 3 colonnes\.$/);
    const cols = (await snapshot(doc)).Hand;
    assert.deepEqual(cols.map((col) => [col.id, col.description]), [["x", "kept"], ["a", ""], ["A2", ""]]);
  }));

test("the interface works the same in English", () =>
  inWidget(async (page, doc) => {
    await analyse(page, PEOPLE_AND_PETS);
    assert.equal(await apply(page), "2 tables created (People, Pets), 3 columns in total.");
  }, { locale: "en" }));
