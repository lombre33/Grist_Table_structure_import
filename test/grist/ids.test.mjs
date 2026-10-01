/** The table ids the widget accepts are the ones Grist creates as typed. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTableId, defaultTableId } from "../../js/importer.js";
import { instance, column } from "./support.mjs";
import { seeded } from "./random.mjs";

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
