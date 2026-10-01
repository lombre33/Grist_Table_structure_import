/**
 * What the widget relies on from the Grist engine, pinned against a real
 * instance: if a Grist upgrade changes one of these behaviours, the failing
 * test names the assumption that no longer holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { instance, column, addTable, columnRef, rows } from "./support.mjs";

test("AddTable normalises the table id and reports the real one in retValues", async () => {
  const doc = await instance.newDoc();
  const created = {};
  for (const id of ["foo", "Foo", "_under", "1abc", "None", "Prénom", "a b"]) {
    created[id] = await addTable(doc, id, [column("A")]);
  }
  assert.deepEqual(created, { foo: "Foo", Foo: "Foo2", _under: "Under", "1abc": "T1abc", None: "TNone", Prénom: "Prenom", "a b": "A_b" });
});

test("AddTable normalises column ids, unique ignoring case, and lists the real ones in retValues", async () => {
  const doc = await instance.newDoc();
  const requested = ["a", "A", "_x", "class", "None", "id", "manualSort", "1x", "x y", "Prénom"];
  const { retValues } = await doc.apply([["AddTable", "T", requested.map((id) => column(id))]]);
  assert.deepEqual(retValues[0].columns, ["a", "A2", "x", "cclass", "cNone", "id2", "manualSort2", "c1x", "x_y", "Prenom"]);
});

test("AddVisibleColumn reports the real column id", async () => {
  const doc = await instance.newDoc();
  const { retValues } = await doc.apply([["AddVisibleColumn", "Table1", "a", column("a")]]);
  assert.deepEqual(retValues[0].colId, "a2", "A, B, C already exist: 'a' collides with 'A' ignoring case");
});

test("AddTable accepts forward, self and dangling references", async () => {
  const doc = await instance.newDoc();
  await doc.apply([
    ["AddTable", "Alpha", [column("ToBeta", "Ref:Beta")]],
    ["AddTable", "Beta", [column("Name")]],
    ["AddTable", "Tree", [column("Parent", "Ref:Tree"), column("Kids", "RefList:Tree")]],
    ["AddTable", "Lonely", [column("X", "Ref:Ghost")]],
  ]);
  const types = async (tableId) => (await doc.columns(tableId)).filter((col) => col.colId !== "manualSort").map((col) => col.type);
  assert.deepEqual(await types("Alpha"), ["Ref:Beta"]);
  assert.deepEqual(await types("Tree"), ["Ref:Tree", "RefList:Tree"]);
  assert.deepEqual(await types("Lonely"), ["Ref:Ghost"]);
});

test("AddTable and AddVisibleColumn drop the description, ModifyColumn keeps it", async () => {
  const doc = await instance.newDoc();
  const described = (id) => column(id, "Text", { description: "from the payload" });
  await doc.apply([["AddTable", "T", [described("A")]], ["AddVisibleColumn", "T", "B", described("B")]]);
  const descriptions = async () => (await doc.columns("T")).filter((col) => col.colId !== "manualSort").map((col) => col.description);
  assert.deepEqual(await descriptions(), ["", ""]);

  await doc.apply([["ModifyColumn", "T", "A", { description: "line 1\nline 2" }]]);
  assert.deepEqual(await descriptions(), ["line 1\nline 2", ""]);
});

test("AddTable and AddVisibleColumn keep the label and the widgetOptions", async () => {
  const doc = await instance.newDoc();
  const options = JSON.stringify({ alignment: "center" });
  await doc.apply([["AddTable", "T", [column("A", "Text", { label: "Nom", widgetOptions: options })]]]);
  const [col] = (await doc.columns("T")).filter((c) => c.colId === "A");
  assert.deepEqual([col.label, col.widgetOptions], ["Nom", options]);
});

test("a failing action rolls the whole batch back", async () => {
  const doc = await instance.newDoc();
  await assert.rejects(
    doc.apply([["AddTable", "First", [column("A")]], ["AddVisibleColumn", "NoSuchTable", "B", column("B")]]),
    /No such table: NoSuchTable/
  );
  assert.deepEqual(await doc.tableIds(), ["Table1"]);
});

test("a column named like the generated code's own `grist` module is rejected without side effect", async () => {
  const doc = await instance.newDoc();
  await assert.rejects(doc.apply([["AddTable", "T", [column("grist"), column("Other")]]]), /Sandbox/);
  assert.deepEqual(await doc.tableIds(), ["Table1"]);
});

test("ModifyColumn visibleCol + SetDisplayFormula make a reference display another column", async () => {
  const doc = await instance.newDoc();
  await doc.apply([["AddTable", "Other", [column("Name")]], ["AddTable", "Main", [column("Owner", "Ref:Other")]]]);
  const nameRef = await columnRef(doc, "Other", "Name");
  const ownerRef = await columnRef(doc, "Main", "Owner");
  await doc.apply([["ModifyColumn", "Main", "Owner", { visibleCol: nameRef }], ["SetDisplayFormula", "Main", null, ownerRef, "$Owner.Name"]]);

  const main = await doc.columns("Main");
  const owner = main.find((col) => col.colId === "Owner");
  assert.equal(owner.visibleCol, nameRef);
  assert.equal(main.find((col) => col.id === owner.displayCol).formula, "$Owner.Name");
});

test("AddVisibleColumn shows the new column in the table's views, AddColumn does not", async () => {
  const doc = await instance.newDoc();
  await doc.apply([["AddVisibleColumn", "Table1", "Shown", column("Shown")], ["AddColumn", "Table1", "Hidden", column("Hidden")]]);
  const pageSections = rows(await doc.fetchTable("_grist_Views_section")).filter((section) => section.parentId !== 0); // not the raw-data and record-card ones
  const shownInViews = rows(await doc.fetchTable("_grist_Views_section_field"))
    .filter((field) => pageSections.some((section) => section.id === field.parentId))
    .map((field) => field.colRef);

  assert.ok(shownInViews.includes(await columnRef(doc, "Table1", "Shown")));
  assert.ok(!shownInViews.includes(await columnRef(doc, "Table1", "Hidden")));
});

test("the plugin-visible metadata has the shape the widget reads, summary tables included", async () => {
  const doc = await instance.newDoc();
  const [table] = rows(await doc.fetchTable("_grist_Tables"));
  const columns = await doc.columns("Table1");
  await doc.apply([["CreateViewSection", table.id, 0, "record", [columns[1].id], null]]);

  const tables = await doc.fetchTable("_grist_Tables");
  assert.ok(["id", "tableId", "summarySourceTable", "rawViewSectionRef"].every((key) => key in tables));
  assert.ok(tables.tableId.includes("Table1_summary_A"), "summary tables are listed alongside real ones");
  const fields = Object.keys(await doc.fetchTable("_grist_Tables_column"));
  for (const key of ["parentId", "parentPos", "colId", "type", "widgetOptions", "isFormula", "formula", "label", "description", "visibleCol"]) {
    assert.ok(fields.includes(key), `_grist_Tables_column.${key}`);
  }
});
