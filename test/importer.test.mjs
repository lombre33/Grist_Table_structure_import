import { test } from "node:test";
import assert from "node:assert/strict";
import { addColumns, checkTableId, createTables, defaultTableId, idFromLabel, isComputed, isTied, resolveColumns, twoWayPairs, twoWayWarnings } from "../js/importer.js";

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
    table(["Owner", "Reference", "'Ghost', visible_col='Name', reverse_of='Pets', widget_options='{\"alignment\":\"left\"}'"]),
    ids(),
    ["People"]
  );
  assert.deepEqual([columns[0].type, columns[0].widgetOptions, columns[0].visibleColId, columns[0].reverseColId], ["Any", null, null, null]);
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
    reverseColId: null,
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
const [OWNER_COLUMN, PETS_COLUMN] = [OWNER, PETS].map(([id, dslType, argsRaw]) => [id, dslType, argsRaw]);

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
  const ghost = made("Pets", ["Owner", "Reference", "'Ghost'"]);
  Object.assign(ghost.columns[0], { type: "Any", reverseColId: "Pets" });
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
    _grist_Tables: { id: tableIds.map((_, i) => i + 1), tableId: tableIds, summarySourceTable: tableIds.map(() => 0), rawViewSectionRef: tableIds.map((_, i) => 100 + i) },
    _grist_Views_section: { id: tableIds.map((_, i) => 100 + i), description: tableIds.map(() => "") },
    _grist_Tables_column: { id: columns.map((_, i) => i + 1), parentId: columns.map((col) => col.parentId), colId: columns.map((col) => col.colId) },
  };
  return {
    calls,
    docApi: {
      listTables: async () => before,
      fetchTable: async (name) => metadata[name],
      applyUserActions: async (actions) => {
        calls.push(actions);
        const result = ([name, tableId, second]) => (name === "AddTable" ? { table_id: tableId, columns: second.map((col) => col.id) } : name === "AddVisibleColumn" ? { colId: second } : null);
        return { retValues: actions.map(result) };
      },
    },
  };
}

test("a display column is set through the row ids of both columns, the one form every Grist version accepts", async () => {
  const grist = recordingGrist({ before: ["People"], after: { People: ["Name"], Main: ["Owner"] } });
  await createTables(grist, [made("Main", ["Owner", "Reference", "'People', visible_col='Name'"])]);
  assert.deepEqual(grist.calls[1], [["ModifyColumn", "Main", "Owner", { visibleCol: 1 }], ["SetDisplayFormula", "Main", null, 2, "$Owner.Name"]]);
});

test("isTied accepts the id Grist derives from a label, numbered or lettered, and no other", () => {
  const tied = [["Nom", "Nom"], ["Prénom", "Prenom"], ["ID", "ID2"], ["id", "id3"], ["manualSort", "manualSort2"], ["Col1", "Col1_2"], ["Nom", "Nom3"], ["Nom", "Nom10"], ["Col1", "Col1_10"], ["日本", "A"], ["日本", "BC"]];
  const own = [["Nom complet", "Nom"], ["Nom", "Nom_x"], ["Nom", "Nomade"], ["Nom", "Nom_"], ["日本", "a"], ["日本", "Nom"], ["Nom", "Nom1"], ["Nom", "Nom_2"], ["Nom", "Nom02"], ["Col1", "Col12"], ["Col1", "Col1_1"]];
  assert.deepEqual(tied.map(([label, id]) => isTied(label, id)), tied.map(() => true));
  assert.deepEqual(own.map(([label, id]) => isTied(label, id)), own.map(() => false));
});

test("a blank formula is no formula: the empty column of Grist is not offered as one", () => {
  const { columns, warnings } = resolveColumns(table(["Empty", "Any", "", "formula", "return None"], ["Real", "Int", "", "formula", "return 1"], ["Plain", "Text"]), ids(), []);
  assert.deepEqual(columns.map(isComputed), [false, true, false]);
  assert.deepEqual(warnings.map((warning) => [warning.key, warning.params.columns]), [["warn.computedColumns", "Real"]]);
});

test("a column whose id Grist numbered stays tied to its label, only one with an id of its own is untied", async () => {
  const grist = recordingGrist({ after: { T: ["ID2", "Nom", "A", "Col1_2", "Extra"] } });
  const labelled = made("T", ["ID2", "Text", "label='ID'"], ["Nom", "Text", "label='Nom complet'"], ["A", "Text", "label='日本'"], ["Col1_2", "Text", "label='Col1'"], ["Extra", "Text", "label='Autre'"]);
  await createTables(grist, [labelled]);
  assert.deepEqual(grist.calls[1], [["ModifyColumn", "T", "Nom", { untieColIdFromLabel: true }], ["ModifyColumn", "T", "Extra", { untieColIdFromLabel: true }]]);
});

/** A text that carries every element, one column for each (two for the two-way links), and a column that carries none. */
const WITH_ELEMENTS = () =>
  table(
    ["Title", "Text", "label='Titre'"],
    ["Note", "Text", "description='Une note'"],
    ["Status", "Choice", "choices=['Todo', 'Done'], widget_options='{\"choiceOptions\":{\"Done\":{\"fillColor\":\"#2A9D53\"}},\"alignment\":\"center\"}'"],
    ["Owner", "Reference", "'People', visible_col='Name', reverse_of='Tasks'"],
    ["Late", "Bool", "", "formula", "return $Due < TODAY()"],
    ["Plain", "Int"]
  );
const ELEMENT_COUNTS = { labels: 1, descriptions: 1, tableDescriptions: 0, choices: 1, options: 1, displayColumns: 1, twoWay: 1, formulas: 1 };

test("resolveColumns counts the elements the text has, over the columns that are not left out, whatever is chosen", () => {
  const options = (extra) => ({ withFormulas: false, ...extra });
  assert.deepEqual(resolveColumns(WITH_ELEMENTS(), ids(), ["People"], options()).counts, ELEMENT_COUNTS);
  assert.deepEqual(resolveColumns(WITH_ELEMENTS(), ids(), ["People"], options({ withFormulas: true, omit: new Set(["labels", "twoWay"]) })).counts, ELEMENT_COUNTS, "what is chosen does not change what the text has");

  const none = Object.fromEntries(Object.keys(ELEMENT_COUNTS).map((element) => [element, 0]));
  assert.deepEqual(resolveColumns(table(["Plain", "Int"]), ids(), []).counts, none);
  assert.deepEqual(resolveColumns(WITH_ELEMENTS(), ids(), ["People"], options({ excluded: new Set(["Title", "Note", "Status", "Owner", "Late"]) })).counts, none, "columns left out count for nothing");
  assert.deepEqual(resolveColumns(WITH_ELEMENTS(), ids(), ["People"], options({ excluded: new Set(["Late", "Title"]) })).counts, { ...ELEMENT_COUNTS, formulas: 0, labels: 0 });
});

test("resolveColumns does not count what the import cannot apply: a display column or a link of a reference that fell back to Any", () => {
  const { counts } = resolveColumns(WITH_ELEMENTS(), ids(), []);
  assert.deepEqual([counts.displayColumns, counts.twoWay], [0, 0]);
});

test("the elements in omit are not in the columns resolved, and the others are", () => {
  const resolved = (...omitted) => resolveColumns(WITH_ELEMENTS(), ids(), ["People"], { omit: new Set(omitted) }).columns;
  const everything = resolved();
  const [title, note, status, owner, late] = everything;
  assert.deepEqual([title.label, note.description, status.widgetOptions, owner.visibleColId, owner.reverseColId, late.formula], ["Titre", "Une note", { choices: ["Todo", "Done"], choiceOptions: { Done: { fillColor: "#2A9D53" } }, alignment: "center" }, "Name", "Tasks", "$Due < TODAY()"]);

  assert.deepEqual(resolved("labels")[0].label, null);
  assert.deepEqual(resolved("descriptions")[1].description, null);
  assert.deepEqual(resolved("choices")[2].widgetOptions, { alignment: "center" });
  assert.deepEqual(resolved("options")[2].widgetOptions, { choices: ["Todo", "Done"], choiceOptions: { Done: { fillColor: "#2A9D53" } } });
  assert.equal(resolved("displayColumns")[3].visibleColId, null);
  assert.equal(resolved("twoWay")[3].reverseColId, null);
  assert.equal(resolved("formulas")[4].formula, "$Due < TODAY()", "the formulas are left to withFormulas, which the payload obeys");
  assert.deepEqual(resolved("labels", "descriptions", "choices", "options", "displayColumns", "twoWay", "formulas").map(({ label, description, widgetOptions, visibleColId, reverseColId }) => [label, description, widgetOptions, visibleColId, reverseColId]), everything.map(() => [null, null, null, null, null]));
});

test("a column omitted of two-way links is no longer part of a pair, nor said to be a plain reference", () => {
  const pets = (omit) => ({ id: "Pets", columns: resolveColumns(table(OWNER_COLUMN), ids(["People", "People"]), [], { omit }).columns });
  const people = (omit) => ({ id: "People", columns: resolveColumns(table(PETS_COLUMN), ids(["Pets", "Pets"]), [], { omit }).columns });
  assert.equal(twoWayPairs([pets(new Set()), people(new Set())]).length, 1);
  const unlinked = [pets(new Set(["twoWay"])), people(new Set(["twoWay"]))];
  assert.deepEqual([twoWayPairs(unlinked), twoWayWarnings(unlinked)], [[], []]);
});

test("with every element omitted, only the id and the type of a column reach the document", async () => {
  const everything = ["labels", "descriptions", "choices", "options", "displayColumns", "twoWay"];
  const create = async (omit) => {
    const grist = recordingGrist({ before: ["People"], after: { People: ["Name"], Tasks: ["Title", "Note", "Status", "Owner", "Late", "Plain"] } });
    const { columns } = resolveColumns(WITH_ELEMENTS(), ids(), ["People"], { withFormulas: true, omit: new Set(omit) });
    await createTables(grist, [{ id: "Tasks", columns }], { withFormulas: true });
    return grist.calls;
  };

  const [plain, ...details] = await create(everything);
  assert.deepEqual(details, [], "no description to add, no display column to set, no id to untie");
  assert.deepEqual(plain[0].slice(0, 2), ["AddTable", "Tasks"]);
  assert.deepEqual(plain[0][2].map(({ id, type, label, widgetOptions }) => [id, type, label, widgetOptions]), [
    ["Title", "Text", "Title", undefined],
    ["Note", "Text", "Note", undefined],
    ["Status", "Choice", "Status", undefined],
    ["Owner", "Ref:People", "Owner", undefined],
    ["Late", "Bool", "Late", undefined],
    ["Plain", "Int", "Plain", undefined],
  ]);

  const [full, ...followUps] = await create([]);
  assert.equal(JSON.parse(full[0][2][2].widgetOptions).alignment, "center");
  assert.ok(followUps.length > 0, "with the elements kept, the engine is asked for the details");
});

test("a table's description is written to its raw data widget, once the table is there, and only for the tables that have one", async () => {
  const grist = recordingGrist({ after: { Plain: ["A"], Described: ["A"], Other: ["A"] } });
  await createTables(grist, [made("Plain", ["A", "Text", ""]), { ...made("Described", ["A", "Text", ""]), description: "Table des\nclients" }, { ...made("Other", ["A", "Text", ""]), description: null }]);
  assert.equal(grist.calls.length, 2);
  assert.deepEqual(grist.calls[1], [["UpdateRecord", "_grist_Views_section", 101, { description: "Table des\nclients" }]]);
});

test("the description of a table goes with the details of its columns", async () => {
  const grist = recordingGrist({ after: { T: ["A"] } });
  await createTables(grist, [{ ...made("T", ["A", "Text", "description='Une colonne'"]), description: "Une table" }]);
  assert.equal(grist.calls.length, 2, "one second call for all of them");
  assert.deepEqual(grist.calls[1].map(([name, table, id]) => [name, table, id]), [["UpdateRecord", "_grist_Views_section", 100], ["ModifyColumn", "T", "A"]]);
});

test("a table description that cannot be written is said, and leaves the table created", async () => {
  const grist = recordingGrist({ after: { T: ["A"] } });
  const failing = { ...grist.docApi, applyUserActions: async (actions) => (actions[0][0] === "AddTable" ? grist.docApi.applyUserActions(actions) : Promise.reject(new Error("no right"))) };
  const { tables, note } = await createTables({ docApi: failing }, [{ ...made("T", ["A", "Text", ""]), description: "Une table" }]);
  assert.equal(tables[0].id, "T");
  assert.match(note, /no right/);
});

test("the columns added to a table that exists leave its description alone", async () => {
  const grist = recordingGrist({ after: { Contacts: ["Name"] } });
  const fresh = made("X", ["Fresh", "Text", "description='Une colonne'"]).columns;
  assert.equal((await addColumns(grist, { tableId: "Contacts", tableRef: 1 }, fresh)).added, 1);
  assert.deepEqual(grist.calls.flat().map(([name]) => name), ["AddVisibleColumn", "ModifyColumn"], "the description of the column, not of the table");
});
