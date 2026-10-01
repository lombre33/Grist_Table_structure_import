/**
 * Code View text recorded from a real Grist (test/grist/record-code-view.mjs),
 * read back as the columns and types the document really had.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseGristSchema } from "../js/parser.js";
import { resolveColumnType } from "../js/gristTypes.js";

const DIR = new URL("./fixtures/code-view/", import.meta.url);

for (const file of readdirSync(DIR).filter((name) => name.endsWith(".py"))) {
  const name = file.replace(".py", "");
  const { tables, warnings } = parseGristSchema(readFileSync(new URL(file, DIR), "utf8"));
  const expected = JSON.parse(readFileSync(new URL(`${name}.json`, DIR), "utf8")).tables;

  test(`${name}: no warning on what Grist itself writes`, () => {
    assert.deepEqual(warnings, []);
  });

  test(`${name}: the same tables`, () => {
    assert.deepEqual(tables.map((table) => table.tableId).sort(), Object.keys(expected).sort());
  });

  for (const table of tables) {
    test(`${name}: ${table.tableId.slice(0, 30)} has the same columns, types and computed flags`, () => {
      const read = table.columns.map((col) => [col.id, resolveColumnType(col.dslType, col.argsRaw, col.id, []).type, col.computed]);
      assert.deepEqual(read, expected[table.tableId]);
    });
  }
}
