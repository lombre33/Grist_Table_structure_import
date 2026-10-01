import { connect, rows } from "./client.mjs";

export const instance = await connect().catch((err) => {
  throw new Error(`No usable Grist instance (set GRIST_URL, see README "Tests against a real Grist"): ${err.message}`);
});

/** A plain data column payload, as the widget sends it to AddTable / AddVisibleColumn. */
export const column = (id, type = "Text", extra = {}) => ({ id, type, isFormula: false, formula: "", ...extra });

/** Creates a table with the given data columns and returns the real `table_id` the engine chose. */
export async function addTable(doc, tableId, columns) {
  const { retValues } = await doc.apply([["AddTable", tableId, columns]]);
  return retValues[0].table_id;
}

/** Row id of a column in `_grist_Tables_column`. */
export async function columnRef(doc, tableId, colId) {
  return (await doc.columns(tableId)).find((col) => col.colId === colId).id;
}

export { rows };
