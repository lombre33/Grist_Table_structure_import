/**
 * What the Import tab does once the text is parsed: resolve its columns to
 * Grist column definitions and apply them to the document. No DOM here.
 */

import { resolveColumnType } from "./gristTypes.js";
import { fetchDocSchema, existingColumnIds } from "./schema.js";
import { errorMessage } from "./util.js";
import { t, tn } from "./i18n.js";

// Table ids Grist creates as they are. It rewrites anything else (capital first
// letter, ASCII only, "None" -> "TNone", ...) and renames clashes with an
// existing table, whatever the case, by adding a number.
const TABLE_ID_RE = /^[A-Z][A-Za-z0-9_]*$/;
const PYTHON_CONSTANTS = new Set(["None", "True", "False"]);

/** The id Grist would keep for a table called `sourceId` in the source code. */
export function defaultTableId(sourceId) {
  const id = sourceId.replace(/^_+/, "");
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * i18n key of what is wrong with a destination table id, or null.
 * `otherIds`: the other tables created at the same time.
 */
export function checkTableId(id, documentTableIds, otherIds) {
  if (!id) return "import.validation.emptyId";
  if (!TABLE_ID_RE.test(id) || PYTHON_CONSTANTS.has(id)) return "import.validation.invalidId";
  const sameId = (other) => other.toLowerCase() === id.toLowerCase();
  if (otherIds.some(sameId)) return "import.validation.duplicateId";
  if (documentTableIds?.some(sameId)) return "import.validation.tableExists";
  return null;
}

/**
 * Grist column definitions for the parsed columns of `table`.
 * `tableIds` maps the source id of each table that receives columns to its id
 * in the document; `documentTableIds` (null if unknown) lists the tables already
 * there. A reference only stays one if its target is one of those, otherwise the
 * column becomes `Any`. Columns in `excluded` raise no warning.
 */
export function resolveColumns(table, tableIds, documentTableIds, excluded = new Set()) {
  const warnings = [];
  const columns = table.columns.map((col) => {
    const colWarnings = excluded.has(col.id) ? [] : warnings;
    const resolved = resolveColumnType(col.dslType, col.argsRaw, col.id, colWarnings);
    if (resolved.refTarget) {
      const inDocument = !documentTableIds || documentTableIds.includes(resolved.refTarget);
      const target = tableIds.get(resolved.refTarget) ?? (inDocument ? resolved.refTarget : null);
      if (target) {
        resolved.type = `${resolved.type.split(":")[0]}:${target}`;
      } else {
        colWarnings.push(t("warn.refTargetMissingInDoc", { colId: col.id, target: resolved.refTarget }));
        Object.assign(resolved, { type: "Any", widgetOptions: null, visibleColId: null });
      }
    }
    return { id: col.id, ...resolved };
  });
  return { columns, warnings };
}

const columnPayload = (col) => ({
  id: col.id,
  type: col.type,
  isFormula: false,
  formula: "",
  label: col.label || col.id,
  ...(col.widgetOptions && { widgetOptions: JSON.stringify(col.widgetOptions) }),
});

/**
 * Creates `tables` (`[{ id, columns }]`) in one atomic batch.
 * @returns {{tables: {id: string, columns: object[]}[], note: string}} the tables
 *   as Grist named them, and what could not be applied afterwards, if anything.
 */
export async function createTables(grist, tables) {
  const taken = new Set((await grist.docApi.listTables()).map((id) => id.toLowerCase()));
  const clashes = tables.filter(({ id }) => taken.has(id.toLowerCase())).map(({ id }) => id);
  if (clashes.length > 0) throw new Error(tn("import.error.tableCollision", clashes.length, { ids: clashes.join(", ") }));

  const actions = tables.map(({ id, columns }) => ["AddTable", id, columns.map(columnPayload)]);
  const { retValues } = await grist.docApi.applyUserActions(actions);
  const created = tables.map(({ columns }, i) => ({
    id: retValues[i].table_id,
    columns: columns.map((col, j) => ({ ...col, id: retValues[i].columns[j] })),
  }));
  return { tables: created, note: await refine(grist, created) };
}

/**
 * Adds to `table` (`{ tableId, tableRef }`) the columns it lacks, ignoring case
 * like Grist does. AddVisibleColumn shows them in the table's views too.
 * @returns {{added: number, note: string}}
 */
export async function addColumns(grist, table, columns) {
  const { allColumns } = await fetchDocSchema(grist);
  const known = existingColumnIds(allColumns, table.tableRef);
  const missing = columns.filter((col) => !known.has(col.id.toLowerCase()));
  if (missing.length === 0) return { added: 0, note: "" };

  const { retValues } = await grist.docApi.applyUserActions(
    missing.map((col) => ["AddVisibleColumn", table.tableId, col.id, columnPayload(col)])
  );
  const added = missing.map((col, i) => ({ ...col, id: retValues[i].colId }));
  return { added: added.length, note: await refine(grist, [{ id: table.tableId, columns: added }]) };
}

/**
 * Applies what the creation actions cannot: AddTable and AddVisibleColumn drop
 * descriptions, and a display column needs the row id of a column that only
 * exists once the tables do. Returns a note about whatever was not applied.
 */
async function refine(grist, tables) {
  const pending = tables.flatMap(({ id, columns }) =>
    columns.filter((col) => col.description || col.visibleColId).map((col) => ({ ...col, tableId: id }))
  );
  if (pending.length === 0) return "";

  try {
    const schema = pending.some((col) => col.visibleColId) ? await fetchDocSchema(grist) : null;
    const notes = [];
    const actions = pending.flatMap((col) => {
      const changes = col.description ? { description: col.description } : {};
      const displayRef = col.visibleColId && displayColumnRef(schema, col);
      if (displayRef) changes.visibleCol = displayRef;
      else if (col.visibleColId) {
        notes.push(t("warn.visibleColMissing", { colId: col.id, visibleColId: col.visibleColId, target: col.type.split(":")[1] }));
      }
      return [
        ...(Object.keys(changes).length > 0 ? [["ModifyColumn", col.tableId, col.id, changes]] : []),
        ...(displayRef ? [["SetDisplayFormula", col.tableId, null, col.id, `$${col.id}.${col.visibleColId}`]] : []),
      ];
    });
    if (actions.length > 0) await grist.docApi.applyUserActions(actions);
    return notes.map((note) => ` ${note}`).join("");
  } catch (err) {
    return t("import.note.refineFailed", { error: errorMessage(err) });
  }
}

/** Row id of the column `col.visibleColId` in the table `col` refers to. */
function displayColumnRef(schema, col) {
  const target = schema.tables.find((table) => table.tableId === col.type.split(":")[1]);
  return target && schema.allColumns.find((c) => c.parentId === target.tableRef && c.colId === col.visibleColId)?.id;
}
