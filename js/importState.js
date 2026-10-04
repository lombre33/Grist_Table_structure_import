/** What the Import tab holds between two actions of the user, and what is worked out from it: no DOM here. */

import { omitTable } from "./elements.js";
import { defaultTableId } from "./importer.js";

/** The state of the "existing table" mode: the source table (its index), the ids of its columns the user took out, its columns resolved. */
export const freshExisting = (index = 0) => ({ index, excluded: new Set(), columns: [] });

/**
 * - parsed: the tables found in the text; warnings: about the text, and about reading the document;
 * - docSchema: this document's tables and columns, null when unreadable;
 * - entries: "new table" mode, one per ticked table: { index, table, id, excluded, columns, input, error, about };
 * - omitted: the elements (see elements.js) left out of what is created: the formulas, until the user asks for them;
 * - busy: an action is being applied.
 */
export const freshState = () => ({ parsed: [], warnings: [], docSchema: null, entries: [], existing: freshExisting(), omitted: new Set(["formulas"]), busy: false });

/** Back to before the analysis: what the text gave is forgotten and the formulas are left out again; `busy` belongs to the action in progress. */
export function resetState(state) {
  Object.assign(state, { ...freshState(), busy: state.busy });
}

export const newEntry = (table, index) => ({ index, table, id: defaultTableId(table.tableId), excluded: new Set() });

export const withFormulas = (state) => !state.omitted.has("formulas");

/** The ids of the tables of the document, null when it could not be read. */
export const documentTableIds = (state) => state.docSchema?.tableIds ?? null;

/** Takes an element (see elements.js) out of what is created, or puts it back. */
export function toggleElement(state, element, kept) {
  if (kept) state.omitted.delete(element);
  else state.omitted.add(element);
}

/** The tables to create as the importer takes them: the id typed (the source's while there is none), the description if it is kept, and the columns still ticked. */
export const batchOf = ({ entries, omitted }) =>
  entries.map((entry) => ({
    id: entry.id.trim() || entry.table.tableId,
    description: omitTable(entry.table, omitted).description,
    columns: entry.columns.filter((col) => !entry.excluded.has(col.id)),
  }));

/** The columns whose checkbox can take them out of (or back into) what will be applied, each with the ids left out of its table. */
export const tickableColumns = (state, mode) =>
  mode === "existing"
    ? state.existing.columns.filter((col) => col.isNew).map((col) => [col, state.existing.excluded])
    : state.entries.flatMap((entry) => entry.columns.map((col) => [col, entry.excluded]));
