import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTableId, defaultTableId, resolveColumns } from "../js/importer.js";

const table = (...columns) => ({ tableId: "Source", columns: columns.map(([id, dslType, argsRaw = ""]) => ({ id, dslType, argsRaw })) });
const ids = (...pairs) => new Map(pairs);

test("defaultTableId gives the id Grist would keep", () => {
  assert.equal(defaultTableId("clients"), "Clients");
  assert.equal(defaultTableId("_hidden"), "Hidden");
  assert.equal(defaultTableId("Already"), "Already");
  assert.equal(defaultTableId("_"), "");
});

test("checkTableId accepts what Grist keeps as is", () => {
  for (const id of ["Clients", "A", "Table_2", "ABC", "X1_y"]) assert.equal(checkTableId(id, [], []), null, id);
});

test("checkTableId rejects empty and rewritten ids", () => {
  assert.equal(checkTableId("", [], []), "import.validation.emptyId");
  for (const id of ["clients", "_x", "1abc", "Prénom", "a b", "A-B", "None", "True", "False"]) {
    assert.equal(checkTableId(id, [], []), "import.validation.invalidId", id);
  }
});

test("checkTableId compares ignoring case, against the document and the other new tables", () => {
  assert.equal(checkTableId("People", ["PEOPLE"], []), "import.validation.tableExists");
  assert.equal(checkTableId("People", [], ["people"]), "import.validation.duplicateId");
  assert.equal(checkTableId("People", null, []), null, "an unknown document list is not an error");
});

test("a reference to a table created together follows its new id", () => {
  const { columns, warnings } = resolveColumns(
    table(["Owner", "Reference", "'People'"], ["Friends", "ReferenceList", "'People'"]),
    ids(["People", "Persons"], ["Source", "Pets"]),
    []
  );
  assert.deepEqual(columns.map((col) => col.type), ["Ref:Persons", "RefList:Persons"]);
  assert.deepEqual(warnings, []);
});

test("a reference to a table already in the document is kept", () => {
  const { columns, warnings } = resolveColumns(table(["Owner", "Reference", "'People'"]), ids(), ["People"]);
  assert.equal(columns[0].type, "Ref:People");
  assert.deepEqual(warnings, []);
});

test("a table created together wins over one of the same name already in the document", () => {
  const { columns } = resolveColumns(table(["Owner", "Reference", "'People'"]), ids(["People", "People2"]), ["People"]);
  assert.equal(columns[0].type, "Ref:People2");
});

test("a reference to an unknown table becomes Any, with a warning, and loses what only made sense as a reference", () => {
  const { columns, warnings } = resolveColumns(
    table(["Owner", "Reference", "'Ghost', visible_col='Name', widget_options='{\"alignment\":\"left\"}'"]),
    ids(),
    ["People"]
  );
  assert.deepEqual([columns[0].type, columns[0].widgetOptions, columns[0].visibleColId], ["Any", null, null]);
  assert.equal(warnings.length, 1);
});

test("without the document's table list, references are left alone", () => {
  const { columns, warnings } = resolveColumns(table(["Owner", "Reference", "'Anything'"]), ids(), null);
  assert.equal(columns[0].type, "Ref:Anything");
  assert.deepEqual(warnings, []);
});

test("columns Grist computes or links both ways are said to be created plainly", () => {
  const source = {
    tableId: "Source",
    columns: [
      { id: "Calc", dslType: "Numeric", argsRaw: "", computed: true },
      { id: "Pets", dslType: "ReferenceList", argsRaw: "'Pets', reverse_of='Owner'", computed: false },
      { id: "Plain", dslType: "Text", argsRaw: "", computed: false },
    ],
  };
  const { warnings } = resolveColumns(source, ids(["Pets", "Pets"]), []);
  assert.deepEqual(warnings.map((w) => [w.key, w.params.columns]), [["warn.computedColumns", "Calc"], ["warn.twoWayColumns", "Pets"]]);
  assert.deepEqual(resolveColumns(source, ids(["Pets", "Pets"]), [], new Set(["Calc", "Pets"])).warnings, []);
});

test("a column left out raises no warning", () => {
  const source = table(["A", "Reference", "'Ghost'"], ["B", "Mystery"]);
  assert.equal(resolveColumns(source, ids(), []).warnings.length, 2);
  assert.deepEqual(resolveColumns(source, ids(), [], new Set(["A", "B"])).warnings, []);
});

test("resolved columns carry the id, the type and the extended metadata", () => {
  const { columns } = resolveColumns(
    table(["Mood", "Choice", "choices=['a'], label='Humeur', description='d'"], ["Plain", "Text"]),
    ids(),
    []
  );
  assert.deepEqual(columns[0], {
    id: "Mood",
    computed: undefined,
    type: "Choice",
    widgetOptions: { choices: ["a"] },
    refTarget: null,
    label: "Humeur",
    description: "d",
    visibleColId: null,
    reverseOf: null,
  });
  assert.equal(columns[1].label, null);
});
