/**
 * The elements a column carries besides its type (labels, descriptions, choice lists, display options, display columns,
 * two-way links, formulas) can be left out by the Export tab and by the Import tab. Against a real document: leaving one
 * out gives the same tables from either tab, leaving them all out gives the types alone, both tabs count the same
 * elements, and the columns added to an existing table follow the choice too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ELEMENTS, elementCounts } from "../../js/elements.js";
import { parseGristSchema } from "../../js/parser.js";
import { addColumns, defaultTableId, resolveColumns } from "../../js/importer.js";
import { buildExportSchema, fetchDocSchema } from "../../js/schema.js";
import { instance, addTable, column, buildSource, exportText, importText, snapshot, expectedAfterImport } from "./support.mjs";
import { SPEC } from "./spec.mjs";

const tableIds = Object.keys(SPEC);
const source = await instance.newDoc("elements: source");
await buildSource(source, SPEC);
const before = await snapshot(source);
const everything = await exportText(source, tableIds);

/** The tables an import makes in a document of its own, as the engine holds them. */
async function imported(text, options) {
  const target = await instance.newDoc("elements: target");
  const { note } = await importText(target, text, options);
  assert.equal(note, "", "nothing the engine refused");
  return snapshot(target);
}

/** What `before` becomes when `element` is left out (the formulas, which Import brings only on request, are brought here). */
const expected = (element, tableId) => expectedAfterImport(before[tableId], { withFormulas: element !== "formulas", omit: [element] });

for (const element of ELEMENTS) {
  test(`${element} left out: the same tables whether the Export tab or the Import tab does it`, async () => {
    const byImport = await imported(everything, { withFormulas: element !== "formulas", omit: [element] });
    const byExport = await imported(await exportText(source, tableIds, [element]), { withFormulas: true });
    for (const tableId of tableIds) {
      assert.deepEqual(byImport[tableId], expected(element, tableId), `Import: ${tableId}`);
      assert.deepEqual(byExport[tableId], expected(element, tableId), `Export: ${tableId}`);
    }
  });
}

test("with every element left out, only the id and the type of each column are left", async () => {
  const bare = await imported(everything, { omit: ELEMENTS });
  for (const tableId of tableIds) {
    assert.deepEqual(bare[tableId], expectedAfterImport(before[tableId], { omit: ELEMENTS }), tableId);
    for (const { id, type, ...rest } of bare[tableId]) {
      assert.deepEqual(rest, { isFormula: false, formula: "", label: id, untied: false, description: "", widgetOptions: null, visibleCol: null, reverseCol: null }, `${tableId}.${id}`);
    }
  }
});

test("the Export tab and the Import tab count the same elements in the same tables", async () => {
  const { tables, allColumns } = await fetchDocSchema(source.grist);
  const { tables: parsed } = parseGristSchema(everything);
  const destination = new Map(parsed.map((table) => [table.tableId, defaultTableId(table.tableId)]));
  for (const { tableId, columns } of buildExportSchema(tables, allColumns, tableIds)) {
    const found = resolveColumns(parsed.find((table) => table.tableId === tableId), destination, tableIds).counts;
    assert.deepEqual(found, elementCounts(columns), tableId);
  }
});

test("the counts of a real table are the elements it was built with", async () => {
  const doc = await instance.newDoc("elements: counts");
  await buildSource(doc, {
    Teams: [{ id: "Title", type: "Text", label: "Intitulé", description: "Nom" }, { id: "Roster", type: "RefList:Members" }],
    Members: [
      { id: "Team", type: "Ref:Teams", visibleCol: "Title", reverse: "Roster" },
      { id: "Mood", type: "Choice", widgetOptions: { choices: ["a", "b"], choiceOptions: { a: { fillColor: "#FF0000" } }, alignment: "center" } },
      { id: "Shout", type: "Text", formula: "$Mood.upper()" },
      { id: "Stamp", type: "Text", trigger: "'new'" },
      { id: "Plain", type: "Int" },
    ],
  });
  const { tables, allColumns } = await fetchDocSchema(doc.grist);
  const columns = buildExportSchema(tables, allColumns, ["Members", "Teams"]).flatMap((table) => table.columns);
  assert.deepEqual(elementCounts(columns), { labels: 1, descriptions: 1, choices: 1, options: 1, displayColumns: 1, twoWay: 2, formulas: 2 });
});

test("the columns added to an existing table leave out the elements too", async () => {
  const doc = await instance.newDoc("elements: existing table");
  await addTable(doc, "Contacts", [column("Name")]);
  const { tables } = parseGristSchema("@grist.UserTable\nclass X:\n  Age = grist.Int(label='Âge', description='Years', widget_options='{\"alignment\":\"right\"}')\n  Mood = grist.Choice(choices=['a'], label='Humeur')\n");
  const { columns } = resolveColumns(tables[0], new Map(), await doc.tableIds(), { omit: new Set(["labels", "choices"]) });
  const { tables: found } = await fetchDocSchema(doc.grist);
  const { note } = await addColumns(doc.grist, found.find((table) => table.tableId === "Contacts"), columns);
  assert.equal(note, "");
  const [, age, mood] = (await snapshot(doc)).Contacts;
  assert.deepEqual([age.label, age.untied, age.description, age.widgetOptions], ["Age", false, "Years", { alignment: "right" }]);
  assert.deepEqual([mood.label, mood.untied, mood.widgetOptions], ["Mood", false, null]);
});
