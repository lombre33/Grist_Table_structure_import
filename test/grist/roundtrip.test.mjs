/**
 * Every column type with its widget options, texts and ids, built in a source
 * document the way Grist does, exported, re-imported in another document and
 * compared column by column: once as the Import tab does by default (formulas
 * left out), once with its option to import them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundTrip, expectedAfterImport } from "./support.mjs";
import { SPEC } from "./spec.mjs";

for (const withFormulas of [false, true]) {
  const mode = withFormulas ? "with formulas" : "without formulas";
  const { text, note, before, after } = await roundTrip(SPEC, { withFormulas });

  test(`${mode}: the whole export is imported without a warning or a note`, () => {
    assert.equal(note, "");
    assert.ok(text.length > 0);
  });

  for (const tableId of Object.keys(SPEC)) {
    const expected = expectedAfterImport(before[tableId], { withFormulas });

    test(`${mode}: ${tableId}: same columns, same order`, () => {
      assert.deepEqual(after[tableId].map((col) => col.id), expected.map((col) => col.id));
    });

    for (const [index, wanted] of expected.entries()) {
      test(`${mode}: ${tableId}.${wanted.id.slice(0, 30)}`, () => {
        assert.deepEqual(after[tableId][index], wanted);
      });
    }
  }
}
