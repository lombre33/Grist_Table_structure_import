/** The Import tab's logic (js/importer.js) applied to a real document. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchDocSchema } from "../../js/schema.js";
import { parseGristSchema } from "../../js/parser.js";
import { addColumns, createTables, resolveColumns } from "../../js/importer.js";
import { instance, column, addTable, importText, snapshot } from "./support.mjs";

const summary = (columns) => columns.map((col) => [col.id, col.type]);

const PEOPLE_AND_PETS = `
@grist.UserTable
class People:
  Name = grist.Text()

@grist.UserTable
class Pets:
  Owner = grist.Reference('People')
  Friends = grist.ReferenceList('People')
`;

test("tables created together keep the references between them", async () => {
  const doc = await instance.newDoc();
  await importText(doc, PEOPLE_AND_PETS);
  const { Pets } = await snapshot(doc);
  assert.deepEqual(summary(Pets), [["Owner", "Ref:People"], ["Friends", "RefList:People"]]);
});

test("references follow a renamed destination table", async () => {
  const doc = await instance.newDoc();
  const { tables } = await importText(doc, PEOPLE_AND_PETS, { ids: { People: "Persons" } });
  assert.deepEqual(tables.map((table) => table.id), ["Persons", "Pets"]);
  assert.deepEqual(summary((await snapshot(doc)).Pets), [["Owner", "Ref:Persons"], ["Friends", "RefList:Persons"]]);
});

test("a renamed table does not capture references meant for the one already in the document", async () => {
  const doc = await instance.newDoc();
  await addTable(doc, "People", [column("Name")]);
  await importText(doc, PEOPLE_AND_PETS, { ids: { People: "People2" } });
  assert.deepEqual(summary((await snapshot(doc)).Pets), [["Owner", "Ref:People2"], ["Friends", "RefList:People2"]]);
});

test("self, mutual and chained references all survive in one batch", async () => {
  const doc = await instance.newDoc();
  await importText(doc, `
@grist.UserTable
class Tree:
  Parent = grist.Reference('Tree')
  Kids = grist.ReferenceList('Tree')

@grist.UserTable
class A:
  ToB = grist.Reference('B')

@grist.UserTable
class B:
  ToA = grist.Reference('A')
  ToC = grist.Reference('C')

@grist.UserTable
class C:
  Name = grist.Text()
`);
  const after = await snapshot(doc);
  assert.deepEqual(summary(after.Tree), [["Parent", "Ref:Tree"], ["Kids", "RefList:Tree"]]);
  assert.deepEqual(summary(after.A), [["ToB", "Ref:B"]]);
  assert.deepEqual(summary(after.B), [["ToA", "Ref:A"], ["ToC", "Ref:C"]]);
});

test("a reference to a table that is neither created nor present becomes Any", async () => {
  const doc = await instance.newDoc();
  await importText(doc, "@grist.UserTable\nclass Pets:\n  Owner = grist.Reference('Ghost')\n");
  assert.deepEqual(summary((await snapshot(doc)).Pets), [["Owner", "Any"]]);
});

test("a reference to a table already in the document is kept", async () => {
  const doc = await instance.newDoc();
  await addTable(doc, "People", [column("Name")]);
  await importText(doc, "@grist.UserTable\nclass Pets:\n  Owner = grist.Reference('People')\n");
  assert.deepEqual(summary((await snapshot(doc)).Pets), [["Owner", "Ref:People"]]);
});

test("createTables returns the table and column ids Grist chose", async () => {
  const doc = await instance.newDoc();
  const { tables } = await createTables(doc.grist, [{ id: "foo", columns: [column("a"), column("A")] }]);
  assert.deepEqual([tables[0].id, tables[0].columns.map((col) => col.id)], ["Foo", ["a", "A2"]]);
});

test("createTables refuses a table that exists already, whatever the case, and creates nothing", async () => {
  const doc = await instance.newDoc();
  await assert.rejects(
    createTables(doc.grist, [{ id: "Fresh", columns: [column("A")] }, { id: "TABLE1", columns: [column("A")] }]),
    /TABLE1/
  );
  assert.deepEqual(await doc.tableIds(), ["Table1"]);
});

test("a rejected batch leaves the document untouched", async () => {
  const doc = await instance.newDoc();
  await assert.rejects(createTables(doc.grist, [{ id: "Fine", columns: [column("A")] }, { id: "Broken", columns: [column("grist"), column("Other")] }]), /Sandbox/);
  assert.deepEqual(await doc.tableIds(), ["Table1"]);
});

test("a table without any column can be created", async () => {
  const doc = await instance.newDoc();
  await createTables(doc.grist, [{ id: "Empty", columns: [] }]);
  assert.deepEqual((await snapshot(doc)).Empty, []);
});

test("descriptions are kept, multi-line ones included", async () => {
  const doc = await instance.newDoc();
  const { note } = await importText(doc, "@grist.UserTable\nclass T:\n  A = grist.Text(description='line 1\\nline 2')\n  B = grist.Text()\n");
  assert.equal(note, "");
  assert.deepEqual((await snapshot(doc)).T.map((col) => col.description), ["line 1\nline 2", ""]);
});

test("a display column is applied whether its table is new, already there or created together", async () => {
  const doc = await instance.newDoc();
  await addTable(doc, "Existing", [column("Label")]);
  const { note } = await importText(doc, `
@grist.UserTable
class People:
  Name = grist.Text()

@grist.UserTable
class Pets:
  Owner = grist.Reference('People', visible_col='Name')
  Kind = grist.Reference('Existing', visible_col='Label')
`);
  assert.equal(note, "");
  assert.deepEqual((await snapshot(doc)).Pets.map((col) => col.visibleCol), ["Name", "Label"]);
  const pets = await doc.columns("Pets");
  assert.ok(pets.some((col) => col.formula === "$Owner.Name"), "the display formula is there too");
});

test("a display column that cannot be found is reported, not fatal", async () => {
  const doc = await instance.newDoc();
  const { tables, note } = await importText(doc, `
@grist.UserTable
class People:
  Name = grist.Text()

@grist.UserTable
class Pets:
  Owner = grist.Reference('People', visible_col='Missing', description='kept')
`);
  assert.equal(tables.length, 2);
  assert.match(note, /Missing/);
  const [owner] = (await snapshot(doc)).Pets;
  assert.deepEqual([owner.visibleCol, owner.description], [null, "kept"]);
});

test("when the second step fails, the tables stay and the note says what was not applied", async () => {
  const doc = await instance.newDoc();
  let batches = 0;
  const flaky = {
    docApi: {
      ...doc.grist.docApi,
      applyUserActions: (actions) => (batches++ === 0 ? doc.grist.docApi.applyUserActions(actions) : Promise.reject(new Error("boom"))),
    },
  };
  const { tables, note } = await createTables(flaky, [{ id: "T", columns: [column("A", "Text", { description: "d" })] }]);
  assert.deepEqual(tables.map((table) => table.id), ["T"]);
  assert.match(note, /boom/);
  assert.ok("T" in (await snapshot(doc)));
});

test("many tables and columns go through one batch", async () => {
  const doc = await instance.newDoc();
  const tables = Array.from({ length: 30 }, (_, t) => ({
    id: `Big${t}`,
    columns: Array.from({ length: 25 }, (_, c) => column(`Col${c}`, c % 2 ? "Numeric" : "Text")),
  }));
  await createTables(doc.grist, tables);
  const after = await snapshot(doc);
  assert.equal(Object.keys(after).length, 31);
  assert.equal(after.Big29.length, 25);
});

async function contacts(doc) {
  await addTable(doc, "Contacts", [column("Name"), column("Email")]);
  const { tables } = await fetchDocSchema(doc.grist);
  return tables.find((table) => table.tableId === "Contacts");
}

function parsedColumns(text) {
  const [table] = parseGristSchema(text).tables;
  return resolveColumns(table, new Map(), []).columns;
}

test("addColumns adds only what is missing, ignoring case, and shows it in the views", async () => {
  const doc = await instance.newDoc();
  const target = await contacts(doc);
  const columns = parsedColumns("@grist.UserTable\nclass X:\n  name = grist.Text()\n  Age = grist.Int()\n  EMAIL = grist.Text()\n");
  const { added } = await addColumns(doc.grist, target, columns);

  assert.equal(added, 1);
  assert.deepEqual((await snapshot(doc)).Contacts.map((col) => col.id), ["Name", "Email", "Age"]);
  assert.deepEqual(doc.batches.at(-1).map((action) => action[0]), ["AddVisibleColumn"]);
});

test("addColumns twice adds nothing the second time", async () => {
  const doc = await instance.newDoc();
  const target = await contacts(doc);
  const columns = parsedColumns("@grist.UserTable\nclass X:\n  Age = grist.Int()\n");
  assert.equal((await addColumns(doc.grist, target, columns)).added, 1);
  assert.equal((await addColumns(doc.grist, target, columns)).added, 0);
});

test("addColumns keeps description, label, widgetOptions and a display column", async () => {
  const doc = await instance.newDoc();
  const target = await contacts(doc);
  await addTable(doc, "Teams", [column("Title")]);
  const columns = resolveColumns(
    parseGristSchema("@grist.UserTable\nclass X:\n  Team = grist.Reference('Teams', visible_col='Title', label='Équipe', description='Qui\\nquoi')\n").tables[0],
    new Map(),
    ["Teams"]
  ).columns;
  const { note } = await addColumns(doc.grist, target, columns);

  assert.equal(note, "");
  const team = (await snapshot(doc)).Contacts.find((col) => col.id === "Team");
  assert.deepEqual([team.type, team.label, team.description, team.visibleCol], ["Ref:Teams", "Équipe", "Qui\nquoi", "Title"]);
});

test("addColumns reports the real id of a column Grist renamed", async () => {
  const doc = await instance.newDoc();
  const target = await contacts(doc);
  const columns = parsedColumns("@grist.UserTable\nclass X:\n  _hidden = grist.Text(description='d')\n");
  await addColumns(doc.grist, target, columns);
  const [added] = (await snapshot(doc)).Contacts.slice(-1);
  assert.deepEqual([added.id, added.description], ["hidden", "d"]);
});

const CALC = `
@grist.UserTable
class Calc:
  A = grist.Int()

  def _default_Start(rec, table, value, user):
    return rec.A + 100
  Start = grist.Int()

  @grist.formulaType(grist.Int())
  def Double(rec, table):
    return rec.A * 2

  @grist.formulaType(grist.Text())
  def Label(rec, table):
    x = rec.A
    return str(x) + '!'

  @grist.formulaType(grist.Numeric())
  def Blank(rec, table):
    return 0.0

  def Broken(rec, table):
    return rec.Nope
`;

const formulas = async (doc, tableId) => (await snapshot(doc))[tableId].map((col) => [col.id, col.isFormula, col.formula]);

test("formulas are left out unless asked for: no column of the table holds any", async () => {
  const doc = await instance.newDoc();
  await importText(doc, CALC);
  assert.deepEqual(await formulas(doc, "Calc"), ["A", "Start", "Double", "Label", "Blank", "Broken"].map((id) => [id, false, ""]));
});

test("with the option, formulas and trigger formulas are created, and Grist computes them", async () => {
  const doc = await instance.newDoc();
  const { note } = await importText(doc, CALC, { withFormulas: true });
  assert.equal(note, "");
  assert.deepEqual(await formulas(doc, "Calc"), [
    ["A", false, ""],
    ["Start", false, "rec.A + 100"],
    ["Double", true, "rec.A * 2"],
    ["Label", true, "x = rec.A\nreturn str(x) + '!'"],
    ["Blank", true, ""],
    ["Broken", true, "rec.Nope"],
  ]);
  await doc.apply([["AddRecord", "Calc", null, { A: 5 }]]);
  const row = await doc.fetchTable("Calc");
  assert.deepEqual([row.Start[0], row.Double[0], row.Label[0], row.Blank[0], row.Broken[0]], [105, 10, "5!", 0, ["E", "AttributeError"]]);
});

test("a column added to an existing table can bring its formula", async () => {
  const doc = await instance.newDoc();
  const target = await contacts(doc);
  const columns = parsedColumns("@grist.UserTable\nclass X:\n  @grist.formulaType(grist.Text())\n  def Shout(rec, table):\n    return rec.Name.upper()\n");
  await addColumns(doc.grist, target, columns, { withFormulas: true });
  assert.deepEqual((await formulas(doc, "Contacts")).at(-1), ["Shout", true, "rec.Name.upper()"]);
  await doc.apply([["AddRecord", "Contacts", null, { Name: "ada" }]]);
  assert.equal((await doc.fetchTable("Contacts")).Shout[0], "ADA");
});
