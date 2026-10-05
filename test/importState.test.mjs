import { test } from "node:test";
import assert from "node:assert/strict";
import { batchOf, documentTableIds, freshState, newEntry, resetState, tickableColumns, toggleElement, withFormulas } from "../js/importState.js";

const table = (tableId, ...ids) => ({ tableId, description: "La table", columns: ids.map((id) => ({ id })) });

test("a new state leaves the formulas out; resetting leaves them out again, forgets the text, and keeps the action that is in progress", () => {
  const state = freshState();
  assert.equal(withFormulas(state), false);
  toggleElement(state, "formulas", true);
  assert.equal(withFormulas(state), true);
  toggleElement(state, "formulas", false);
  assert.equal(withFormulas(state), false);

  toggleElement(state, "formulas", true);
  Object.assign(state, { busy: true, parsed: [table("T")], warnings: [{ key: "x" }], docSchema: { tableIds: ["A"] }, entries: [newEntry(table("T"), 0)] });
  resetState(state);
  assert.deepEqual([withFormulas(state), state.busy, state.parsed, state.warnings, state.docSchema, state.entries], [false, true, [], [], null, []]);

  state.busy = false;
  resetState(state);
  assert.equal(state.busy, false);
});

test("the tables to create take the id typed, or the source's while the field is blank, the columns still ticked, and the description unless it is left out", () => {
  const state = freshState();
  const clients = { ...newEntry(table("clients", "A", "B"), 0), id: "  Mes_clients ", columns: [{ id: "A" }, { id: "B" }] };
  const orders = { ...newEntry(table("Orders", "C"), 1), id: "  ", columns: [{ id: "C" }] };
  clients.excluded.add("B");
  state.entries = [clients, orders];
  assert.deepEqual(batchOf(state), [
    { id: "Mes_clients", description: "La table", columns: [{ id: "A" }] },
    { id: "Orders", description: "La table", columns: [{ id: "C" }] },
  ]);
  toggleElement(state, "tableDescriptions", false);
  assert.deepEqual(batchOf(state).map(({ description }) => description), [null, null]);
});

test("a table starts under the id Grist would keep for its name, with nothing left out", () => {
  const entry = newEntry(table("clients", "A"), 3);
  assert.deepEqual([entry.index, entry.id, [...entry.excluded]], [3, "Clients", []]);
});

test("the tables of the document are those of its schema, none known when it could not be read", () => {
  assert.equal(documentTableIds({ docSchema: null }), null);
  assert.deepEqual(documentTableIds({ docSchema: { tableIds: ["A", "B"] } }), ["A", "B"]);
});

test("the columns that a box can take out are the new ones of the table that receives them, or every one of the tables to create", () => {
  const state = freshState();
  state.existing.columns = [{ id: "Old", isNew: false }, { id: "Fresh", isNew: true }];
  state.entries = [{ ...newEntry(table("T"), 0), columns: [{ id: "A" }, { id: "B" }] }];
  assert.deepEqual(tickableColumns(state, "existing").map(([col, taken]) => [col.id, taken === state.existing.excluded]), [["Fresh", true]]);
  assert.deepEqual(tickableColumns(state, "create").map(([col, taken]) => [col.id, taken === state.entries[0].excluded]), [["A", true], ["B", true]]);
});
