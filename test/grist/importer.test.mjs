/** The Import tab's logic (js/importer.js) applied to a real document. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const PROJECTS = `
@grist.UserTable
class Projects:
  Name = grist.Text()
  Owner = grist.Reference('People', reverse_of='Projects', description='kept')

@grist.UserTable
class People:
  Name = grist.Text()
  Projects = grist.ReferenceList('Projects', reverse_of='Owner')
`;

const links = async (doc, tableId) => (await snapshot(doc))[tableId].filter((col) => col.reverseCol).map((col) => [col.id, col.reverseCol]);

test("two-way references created together are linked, and Grist keeps their values in step", async () => {
  const doc = await instance.newDoc();
  const { note } = await importText(doc, PROJECTS);
  assert.equal(note, "");
  assert.deepEqual([await links(doc, "Projects"), await links(doc, "People")], [[["Owner", "Projects"]], [["Projects", "Owner"]]]);
  await doc.apply([["AddRecord", "People", null, { Name: "Ada" }], ["AddRecord", "Projects", null, { Name: "P1", Owner: 1 }]]);
  assert.deepEqual((await doc.fetchTable("People")).Projects, [["L", 1]]);
});

test("a renamed table keeps its two-way link, and the other details are applied too", async () => {
  const doc = await instance.newDoc();
  const { note } = await importText(doc, PROJECTS, { ids: { People: "Persons" } });
  assert.equal(note, "");
  assert.deepEqual([await links(doc, "Projects"), await links(doc, "Persons")], [[["Owner", "Projects"]], [["Projects", "Owner"]]]);
  assert.equal((await snapshot(doc)).Projects[1].description, "kept");
});

test("a pair whose counterpart is left out stays a plain reference, and nothing fails", async () => {
  const doc = await instance.newDoc();
  const { note } = await importText(doc, PROJECTS, { exclude: { People: ["Projects"] } });
  assert.equal(note, "");
  assert.deepEqual([await links(doc, "Projects"), (await snapshot(doc)).People.map((col) => col.id)], [[], ["Name"]]);
});

test("a reference whose counterpart is in the document already is not linked: its values would be overwritten", async () => {
  const doc = await instance.newDoc();
  await addTable(doc, "People", [column("Name"), column("Projects", "RefList:Projects")]);
  await importText(doc, "@grist.UserTable\nclass Projects:\n  Owner = grist.Reference('People', reverse_of='Projects')\n");
  assert.deepEqual([await links(doc, "Projects"), await links(doc, "People")], [[], []]);
});

test("a pair of columns of one table can be linked while adding them to an existing table", async () => {
  const doc = await instance.newDoc();
  await addTable(doc, "Org", [column("Name")]);
  const { tables } = await fetchDocSchema(doc.grist);
  const [source] = parseGristSchema("@grist.UserTable\nclass X:\n  Parent = grist.Reference('X', reverse_of='Kids')\n  Kids = grist.ReferenceList('X', reverse_of='Parent')\n").tables;
  const { columns } = resolveColumns(source, new Map([["X", "Org"]]), ["Org"]);
  const { note } = await addColumns(doc.grist, tables.find((table) => table.tableId === "Org"), columns);
  assert.equal(note, "");
  assert.deepEqual(await links(doc, "Org"), [["Parent", "Kids"], ["Kids", "Parent"]]);
});

test("a link Grist refuses is reported, and the tables with their descriptions stay", async () => {
  const doc = await instance.newDoc();
  const refusing = {
    ...doc,
    grist: {
      docApi: {
        ...doc.grist.docApi,
        applyUserActions: (actions) => (actions.some((action) => action[3]?.reverseCol) ? Promise.reject(new Error("no two-way here")) : doc.grist.docApi.applyUserActions(actions)),
      },
    },
  };
  const { tables, note } = await importText(refusing, PROJECTS);
  assert.deepEqual(tables.map((table) => table.id), ["Projects", "People"]);
  assert.match(note, /no two-way here/);
  assert.deepEqual([await links(doc, "Projects"), (await snapshot(doc)).Projects[1].description], [[], "kept"]);
});

test("a whole real Code View, recorded from Grist, is imported with its formulas and its two-way references linked", async () => {
  const fixtures = new URL("../fixtures/code-view/", import.meta.url);
  const expected = JSON.parse(readFileSync(new URL("every-column.json", fixtures), "utf8")).tables;
  const doc = await instance.newDoc();
  const { tables, note } = await importText(doc, readFileSync(new URL("every-column.py", fixtures), "utf8"), { ids: { Table1: "Table1_copy" }, withFormulas: true });

  assert.equal(note, "");
  assert.equal(tables.length, Object.keys(expected).length);
  const after = await snapshot(doc);
  delete after.Table1;
  const computed = (columns) => columns.filter((col) => col.isFormula || col.formula).length;
  assert.equal(Object.values(after).reduce((total, columns) => total + computed(columns), 0), Object.values(expected).flat().filter(([, , isComputed]) => isComputed).length);
  assert.deepEqual([await links(doc, "Projects"), await links(doc, "People")], [[["Owner", "Projects"]], [["Projects", "Owner"]]]);
  assert.deepEqual(await links(doc, "Grid"), [["Left", "Right"], ["Right", "Left"], ["Parent", "Kids"], ["Kids", "Parent"]]);
});

test("a column whose id is its own keeps it when its label is edited, one whose id follows its label still follows it", async () => {
  const doc = await instance.newDoc();
  await importText(doc, "@grist.UserTable\nclass T:\n  Name = grist.Text(label='Nom')\n  Nom_complet = grist.Text(label='Nom complet')\n  Plain = grist.Text()\n");
  assert.deepEqual((await snapshot(doc)).T.map((col) => [col.id, col.untied]), [["Name", true], ["Nom_complet", false], ["Plain", false]]);

  const ref = async (id) => (await doc.columns("T")).find((col) => col.colId === id).id;
  await doc.apply([
    ["UpdateRecord", "_grist_Tables_column", await ref("Name"), { label: "Nom 2" }],
    ["UpdateRecord", "_grist_Tables_column", await ref("Nom_complet"), { label: "Nom complet 2" }],
  ]);
  assert.deepEqual((await snapshot(doc)).T.map((col) => col.id), ["Name", "Nom_complet_2", "Plain"]);
});

test("addColumns keeps the id of a column apart from its label too", async () => {
  const doc = await instance.newDoc();
  const target = await contacts(doc);
  await addColumns(doc.grist, target, parsedColumns("@grist.UserTable\nclass X:\n  Phone = grist.Text(label='Téléphone')\n"));
  const phone = (await snapshot(doc)).Contacts.at(-1);
  assert.deepEqual([phone.id, phone.label, phone.untied], ["Phone", "Téléphone", true]);
});
