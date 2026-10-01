import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTableId, createTables, defaultTableId, idFromLabel, resolveColumns, twoWayPairs, twoWayWarnings } from "../js/importer.js";

const table = (...columns) => ({ tableId: "Source", columns: columns.map(([id, dslType, argsRaw = "", kind = "data", code = ""]) => ({ id, dslType, argsRaw, kind, code })) });
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

test("idFromLabel drops accents, replaces other characters by _ and protects digits and keywords", () => {
  const derived = (label) => idFromLabel(label);
  assert.deepEqual(
    ["Nom complet", "Prénom", "ÀÉÎÕÜ ç", "a-b", "(x) [y] {z}", "  spaced  ", "__x", "x1", "émoji 😀 é"].map(derived),
    ["Nom_complet", "Prenom", "AEIOU_c", "a_b", "x_y_z_", "spaced_", "x", "x1", "emoji_e"]
  );
  assert.deepEqual(["2e essai", "class", "None", "True", "async"].map(derived), ["c2e_essai", "cclass", "cNone", "cTrue", "casync"]);
  assert.deepEqual(["", "_", "日本"].map(derived), ["", "", ""], "nothing left: Grist numbers the column");
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

test("columns Grist computes are said to be created empty", () => {
  const source = table(["Calc", "Numeric", "", "formula", "return 1"], ["Stamp", "Text", "", "trigger", "return 'x'"], ["Plain", "Text"]);
  const { warnings } = resolveColumns(source, ids(), []);
  assert.deepEqual(warnings.map((w) => [w.key, w.params.columns]), [["warn.computedColumns", "Calc, Stamp"]]);
  assert.deepEqual(resolveColumns(source, ids(), [], { excluded: new Set(["Calc", "Stamp"]) }).warnings, []);
});

test("formulas that are imported are not said to be lost", () => {
  const source = table(["Calc", "Numeric", "", "formula", "return 1"], ["Plain", "Text"]);
  assert.deepEqual(resolveColumns(source, ids(), [], { withFormulas: true }).warnings, []);
});

test("a function body becomes the formula Grist stores", () => {
  const formulaOf = (code, dslType = "Any", argsRaw = "") => resolveColumns(table(["F", dslType, argsRaw, "formula", code]), ids(), []).columns[0].formula;
  assert.equal(formulaOf("return $A * 2"), "$A * 2", "a lone return is the formula");
  assert.equal(formulaOf("return rec.A * 2"), "rec.A * 2", "rec.A is as valid as $A");
  assert.equal(formulaOf("return (rec.A +\n  rec.B)"), "(rec.A +\n  rec.B)", "a statement over several lines");
  assert.equal(formulaOf("x = $A\nreturn x + 1"), "x = $A\nreturn x + 1", "several statements stay as they are");
  assert.equal(formulaOf("returned = 1\nreturned"), "returned = 1\nreturned", "a name that starts with return is not a return");
});

test("the blank formula of a type, or no value at all, is no formula", () => {
  const formulaOf = (code, dslType, argsRaw = "") => resolveColumns(table(["F", dslType, argsRaw, "formula", code]), ids(), []).columns[0].formula;
  assert.deepEqual(
    [formulaOf("return None", "Any"), formulaOf("return ''", "Text"), formulaOf("return 0", "Int"), formulaOf("return 0.0", "Numeric"), formulaOf("return False", "Bool"), formulaOf("return", "Date"), formulaOf("", "Text")],
    ["", "", "", "", "", "", ""]
  );
  assert.equal(formulaOf("return 0", "Text"), "0", "0 is a real formula for a text column");
  assert.equal(formulaOf("return None", "Text"), "None");
  assert.equal(resolveColumns(table(["R", "Reference", "'T'", "formula", "return 0"]), ids(), ["T"]).columns[0].formula, "", "a reference is blank at 0");
  const downgraded = resolveColumns(table(["R", "Reference", "'Ghost'", "formula", "return 0"]), ids(), ["T"]).columns[0];
  assert.deepEqual([downgraded.type, downgraded.formula], ["Any", ""], "blank for the type it was declared with, not the one it falls back to");
});

test("a column left out raises no warning", () => {
  const source = table(["A", "Reference", "'Ghost'"], ["B", "Mystery"]);
  assert.equal(resolveColumns(source, ids(), []).warnings.length, 2);
  assert.deepEqual(resolveColumns(source, ids(), [], { excluded: new Set(["A", "B"]) }).warnings, []);
});

test("resolved columns carry the id, the type and the extended metadata", () => {
  const { columns } = resolveColumns(
    table(["Mood", "Choice", "choices=['a'], label='Humeur', description='d'"], ["Plain", "Text"]),
    ids(),
    []
  );
  assert.deepEqual(columns[0], {
    id: "Mood",
    kind: "data",
    formula: "",
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

/** A table as the batch holds it: the columns of `source` resolved, every table of the tests known. */
const made = (id, ...columns) => ({
  id,
  columns: resolveColumns(
    { tableId: id, columns: columns.map(([colId, dslType, argsRaw]) => ({ id: colId, dslType, argsRaw, kind: "data", code: "" })) },
    ids(["People", "People"], ["Pets", "Pets"], ["Org", "Org"]),
    []
  ).columns,
});
const names = (pairs) => pairs.map((pair) => pair.map(({ tableId, col }) => `${tableId}.${col.id}`));

const OWNER = ["Owner", "Reference", "'People', reverse_of='Pets'"];
const PETS = ["Pets", "ReferenceList", "'Pets', reverse_of='Owner'"];

test("two columns that name each other and refer to each other's table are one two-way pair", () => {
  const batch = [made("Pets", OWNER), made("People", PETS)];
  assert.deepEqual(names(twoWayPairs(batch)), [["Pets.Owner", "People.Pets"]]);
  assert.deepEqual(twoWayWarnings(batch), []);
});

test("a table can be paired with itself", () => {
  const batch = [made("Org", ["Parent", "Reference", "'Org', reverse_of='Children'"], ["Children", "ReferenceList", "'Org', reverse_of='Parent'"])];
  assert.deepEqual(names(twoWayPairs(batch)), [["Org.Parent", "Org.Children"]]);
});

test("a column whose counterpart is not created with it stays a plain reference, and is said to", () => {
  for (const batch of [[made("Pets", OWNER)], [made("Pets", OWNER), made("People", ["Pets", "ReferenceList", "'Pets'"])], [made("Pets", OWNER), made("People", ["Pets", "ReferenceList", "'Pets', reverse_of='Other'"])]]) {
    assert.deepEqual(twoWayPairs(batch), []);
    assert.deepEqual(twoWayWarnings(batch)[0], { key: "warn.twoWayColumns", params: { columns: "Owner" }, table: "Pets" });
  }
});

test("a counterpart that does not refer back to the table is no counterpart", () => {
  const batch = [made("Pets", OWNER), made("People", ["Pets", "ReferenceList", "'Org', reverse_of='Owner'"])];
  assert.deepEqual(twoWayPairs(batch), []);
  assert.deepEqual(twoWayWarnings(batch).map((warning) => [warning.table, warning.params.columns]), [["Pets", "Owner"], ["People", "Pets"]]);
});

test("a column that is not a reference after all is never paired", () => {
  const ghost = made("Pets", ["Owner", "Reference", "'Ghost', reverse_of='Pets'"]);
  ghost.columns[0].type = "Any";
  assert.deepEqual(twoWayPairs([ghost, made("People", PETS)]), []);
});

test("several pairs are found, each once", () => {
  const batch = [
    made("Pets", OWNER, ["Vet", "Reference", "'People', reverse_of='Patients'"]),
    made("People", PETS, ["Patients", "ReferenceList", "'Pets', reverse_of='Vet'"]),
  ];
  assert.deepEqual(names(twoWayPairs(batch)), [["Pets.Owner", "People.Pets"], ["Pets.Vet", "People.Patients"]]);
});

/**
 * A Grist that records what is applied and describes the document as it is once it has been: `after` maps
 * each table to its columns (row ids follow the order), `before` lists the tables there at the start.
 */
function recordingGrist({ after, before = [] }) {
  const calls = [];
  const tableIds = Object.keys(after);
  const columns = tableIds.flatMap((tableId, i) => after[tableId].map((colId) => ({ parentId: i + 1, colId })));
  const metadata = {
    _grist_Tables: { id: tableIds.map((_, i) => i + 1), tableId: tableIds, summarySourceTable: tableIds.map(() => 0) },
    _grist_Tables_column: { id: columns.map((_, i) => i + 1), parentId: columns.map((col) => col.parentId), colId: columns.map((col) => col.colId) },
  };
  return {
    calls,
    docApi: {
      listTables: async () => before,
      fetchTable: async (name) => metadata[name],
      applyUserActions: async (actions) => {
        calls.push(actions);
        return { retValues: actions.map(([name, tableId, second]) => (name === "AddTable" ? { table_id: tableId, columns: second.map((col) => col.id) } : null)) };
      },
    },
  };
}

test("a display column is set through the row ids of both columns, the one form every Grist version accepts", async () => {
  const grist = recordingGrist({ before: ["People"], after: { People: ["Name"], Main: ["Owner"] } });
  await createTables(grist, [made("Main", ["Owner", "Reference", "'People', visible_col='Name'"])]);
  assert.deepEqual(grist.calls[1], [["ModifyColumn", "Main", "Owner", { visibleCol: 1 }], ["SetDisplayFormula", "Main", null, 2, "$Owner.Name"]]);
});
