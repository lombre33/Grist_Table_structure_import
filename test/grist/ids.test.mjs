/** The ids the widget expects Grist to create or derive: tables as typed, columns from their label. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTableId, defaultTableId, idFromLabel } from "../../js/importer.js";
import { instance, column, rows } from "./support.mjs";
import { seeded } from "../random.mjs";

const random = seeded(2024);
const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_éà -.$'\"#";
const randomId = () => Array.from({ length: 1 + Math.floor(random() * 12) }, () => CHARS[Math.floor(random() * CHARS.length)]).join("");

const CORPUS = [
  "A", "Z", "A_", "A__", "A_1", "A1", "ABC_DEF", "Class", "Def", "Lambda", "Self", "Rec", "Table", "Id", "ManualSort", "Any",
  "Text", "SUM", "DATE", "IF", "None", "True", "False", "_x", "x", "1a", "Prénom", "a b", "A-B", "", "L".repeat(150),
  ...Array.from({ length: 400 }, randomId),
];

test("an id accepted by checkTableId, or proposed by defaultTableId, is created unchanged", async () => {
  const candidates = [...CORPUS, ...CORPUS.map(defaultTableId)];
  const accepted = candidates.filter((id) => checkTableId(id, ["Table1"], []) === null);
  const distinct = [...new Map(accepted.map((id) => [id.toLowerCase(), id])).values()];
  assert.ok(distinct.length > 100, "the corpus is not trivial");

  const doc = await instance.newDoc();
  const { retValues } = await doc.apply(distinct.map((id) => ["AddTable", id, [column("A")]]));
  assert.deepEqual(retValues.map((value) => value.table_id), distinct);
});

test("the ids it rejects as invalid are the ones Grist would rewrite", async () => {
  const doc = await instance.newDoc();
  for (const id of ["None", "True", "False", "Prénom", "A-B", "1a", "_x", "x", "a b"]) {
    const [{ table_id }] = (await doc.apply([["AddTable", id, [column("A")]]])).retValues;
    assert.notEqual(table_id, id);
    assert.equal(checkTableId(id, [], []), "import.validation.invalidId");
  }
});

const LABEL_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789__ éàçÉÖж😀-.$'\"#()";
const LABELS = [
  "Nom complet", "Prénom", "2e essai", "class", "None", "True", "def", "lambda", "async", "await", "yield", "self", "print", "__x", "_", "  spaced  ", "a-b", "é", "x1", "ÀÉÎÕÜ ç", "(x) [y] {z}", "multi\nline", "tab\there",
  ...Array.from({ length: 300 }, () => Array.from({ length: 1 + Math.floor(random() * 10) }, () => [...LABEL_CHARS][Math.floor(random() * [...LABEL_CHARS].length)]).join("")),
];

test("the id derived from a label is the one Grist gives a column whose label is edited", async () => {
  const doc = await instance.newDoc();
  await doc.apply(LABELS.map((_, i) => ["AddTable", `L${i}`, [column("Zz_seed")]]));
  const refs = new Map(rows(await doc.fetchTable("_grist_Tables_column")).filter((col) => col.colId === "Zz_seed").map((col) => [col.parentId, col.id]));
  const tables = new Map(rows(await doc.fetchTable("_grist_Tables")).map((table) => [table.tableId, table.id]));
  await doc.apply(LABELS.map((label, i) => ["UpdateRecord", "_grist_Tables_column", refs.get(tables.get(`L${i}`)), { label }]));

  const ids = new Map(rows(await doc.fetchTable("_grist_Tables_column")).filter((col) => refs.has(col.parentId) && !["manualSort", "id"].includes(col.colId)).map((col) => [col.parentId, col.colId]));
  LABELS.forEach((label, i) => {
    const derived = idFromLabel(label);
    const engine = ids.get(tables.get(`L${i}`));
    if (derived) assert.equal(engine, derived, JSON.stringify(label));
    else assert.match(engine, /^[A-Z]+$/, `${JSON.stringify(label)}: nothing to derive, Grist numbers the column`);
  });
});
