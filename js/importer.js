/**
 * What the Import tab does once the text is parsed: resolve its columns to
 * Grist column definitions and apply them to the document. No DOM here.
 */

import { defaultLiteralForType, resolveColumnType, splitType } from "./gristTypes.js";
import { fetchDocSchema, existingColumnIds } from "./schema.js";
import { reportError } from "./util.js";
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

/** A formula column, or a data column with a trigger formula: what an import cannot reproduce without `withFormulas`. */
export const isComputed = (col) => col.kind !== "data";

/**
 * The formula Grist stores for a function body of Code View: a lone `return X` is X, and what a
 * blank formula returns for the type (`return None`) means no formula at all.
 */
function formulaOf(code, type) {
  const formula = code.replace(/^return(\s+|$)/, "").trim();
  return formula === defaultLiteralForType(type) ? "" : formula;
}

/**
 * Grist column definitions for the parsed columns of `table`.
 * `tableIds` maps the source id of each table that receives columns to its id
 * in the document; `documentTableIds` (null if unknown) lists the tables already
 * there. A reference only stays one if its target is one of those, otherwise the
 * column becomes `Any`. Columns in `excluded` raise no warning; `withFormulas`
 * says that formulas are imported, so that nothing is said about their loss.
 */
export function resolveColumns(table, tableIds, documentTableIds, { excluded = new Set(), withFormulas = false } = {}) {
  const warnings = [];
  const columns = table.columns.map((col) => {
    const colWarnings = excluded.has(col.id) ? [] : warnings;
    const resolved = resolveColumnType(col.dslType, col.argsRaw, col.id, colWarnings);
    const formula = formulaOf(col.code, resolved.type);
    if (resolved.refTarget) {
      const inDocument = !documentTableIds || documentTableIds.includes(resolved.refTarget);
      const target = tableIds.get(resolved.refTarget) ?? (inDocument ? resolved.refTarget : null);
      if (target) {
        resolved.type = `${splitType(resolved.type).name}:${target}`;
      } else {
        colWarnings.push({ key: "warn.refTargetMissingInDoc", params: { colId: col.id, target: resolved.refTarget } });
        Object.assign(resolved, { type: "Any", widgetOptions: null, visibleColId: null });
      }
    }
    return { id: col.id, kind: col.kind, formula, ...resolved };
  });

  const computed = withFormulas ? [] : columns.filter((col) => isComputed(col) && !excluded.has(col.id));
  if (computed.length > 0) warnings.push({ key: "warn.computedColumns", params: { columns: computed.map((col) => col.id).join(", ") } });
  return { columns, warnings };
}

const keyOf = (tableId, colId) => `${tableId}.${colId}`;

/**
 * The two-way references among `tables` (`[{ id, columns }]`): two columns that each name the other
 * in `reverse_of` and refer to each other's table, as `[{ tableId, col }, { tableId, col }]`. Only
 * columns created together can be linked: linking one that exists would overwrite its values.
 */
export function twoWayPairs(tables) {
  const all = tables.flatMap(({ id, columns }) => columns.map((col) => ({ tableId: id, col })));
  const byKey = new Map(all.map((entry) => [keyOf(entry.tableId, entry.col.id), entry]));
  return all.flatMap((a, i) => {
    const b = a.col.reverseOf && byKey.get(keyOf(splitType(a.col.type).arg, a.col.reverseOf));
    const mutual = b && b.col.reverseOf === a.col.id && splitType(b.col.type).arg === a.tableId;
    return mutual && i < all.indexOf(b) ? [[a, b]] : [];
  });
}

/** What is said, per table, about the two-way references that `tables` cannot link: they become plain references. */
export function twoWayWarnings(tables) {
  const linked = new Set(twoWayPairs(tables).flat().map(({ col }) => col));
  return tables.flatMap(({ id, columns }) => {
    const plain = columns.filter((col) => col.reverseOf && !linked.has(col));
    return plain.length > 0 ? [{ key: "warn.twoWayColumns", params: { columns: plain.map((col) => col.id).join(", ") }, table: id }] : [];
  });
}

const columnPayload = (col, withFormulas) => ({
  id: col.id,
  type: col.type,
  isFormula: withFormulas && col.kind === "formula",
  formula: withFormulas ? col.formula : "",
  label: col.label || col.id,
  ...(col.widgetOptions && { widgetOptions: JSON.stringify(col.widgetOptions) }),
});

/**
 * Creates `tables` (`[{ id, columns }]`) in one atomic batch, with the formulas of their columns
 * if `withFormulas`.
 * @returns {{tables: {id: string, columns: object[]}[], note: string}} the tables
 *   as Grist named them, and what could not be applied afterwards, if anything.
 */
export async function createTables(grist, tables, { withFormulas = false } = {}) {
  const taken = new Set((await grist.docApi.listTables()).map((id) => id.toLowerCase()));
  const clashes = tables.filter(({ id }) => taken.has(id.toLowerCase())).map(({ id }) => id);
  if (clashes.length > 0) throw new Error(tn("import.error.tableCollision", clashes.length, { ids: clashes.join(", ") }));

  const actions = tables.map(({ id, columns }) => ["AddTable", id, columns.map((col) => columnPayload(col, withFormulas))]);
  const { retValues } = await grist.docApi.applyUserActions(actions);
  const created = tables.map(({ columns }, i) => ({
    id: retValues[i].table_id,
    columns: columns.map((col, j) => ({ ...col, id: retValues[i].columns[j] })),
  }));
  const actual = new Map(created.flatMap(({ id, columns }, i) => tables[i].columns.map((col, j) => [col, { tableId: id, id: columns[j].id }])));
  const pairs = twoWayPairs(tables).map((pair) => pair.map(({ col }) => actual.get(col)));
  return { tables: created, note: (await refine(grist, created)) + (await linkTwoWay(grist, pairs)) };
}

/**
 * Adds to `table` (`{ tableId, tableRef }`) the columns it lacks, ignoring case
 * like Grist does. AddVisibleColumn shows them in the table's views too.
 * @returns {{added: number, note: string}}
 */
export async function addColumns(grist, table, columns, { withFormulas = false } = {}) {
  const { allColumns } = await fetchDocSchema(grist);
  const known = existingColumnIds(allColumns, table.tableRef);
  const missing = columns.filter((col) => !known.has(col.id.toLowerCase()));
  if (missing.length === 0) return { added: 0, note: "" };

  const { retValues } = await grist.docApi.applyUserActions(
    missing.map((col) => ["AddVisibleColumn", table.tableId, col.id, columnPayload(col, withFormulas)])
  );
  const added = missing.map((col, i) => ({ ...col, id: retValues[i].colId }));
  const actual = new Map(missing.map((col, i) => [col, { tableId: table.tableId, id: added[i].id }]));
  const pairs = twoWayPairs([{ id: table.tableId, columns: missing }]).map((pair) => pair.map(({ col }) => actual.get(col)));
  return { added: added.length, note: (await refine(grist, [{ id: table.tableId, columns: added }])) + (await linkTwoWay(grist, pairs)) };
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
    const actions = [];
    const unfound = [];
    for (const col of pending) {
      const displayRef = col.visibleColId ? displayColumnRef(schema, col) : null;
      if (col.visibleColId && !displayRef) unfound.push(col);
      const changes = { ...(col.description && { description: col.description }), ...(displayRef && { visibleCol: displayRef }) };
      if (Object.keys(changes).length > 0) actions.push(["ModifyColumn", col.tableId, col.id, changes]);
      if (displayRef) actions.push(["SetDisplayFormula", col.tableId, null, col.id, `$${col.id}.${col.visibleColId}`]);
    }
    if (actions.length > 0) await grist.docApi.applyUserActions(actions);
    return unfound.map((col) => ` ${t("warn.visibleColMissing", { colId: col.id, visibleColId: col.visibleColId, target: splitType(col.type).arg })}`).join("");
  } catch (err) {
    return t("import.note.refineFailed", { error: reportError(err) });
  }
}

/**
 * Links each pair of two-way reference columns (`[{ tableId, id }, { tableId, id }]`): Grist then
 * keeps the values of both in step. A failure is reported without undoing what was created.
 */
async function linkTwoWay(grist, pairs) {
  if (pairs.length === 0) return "";
  try {
    const schema = await fetchDocSchema(grist);
    await grist.docApi.applyUserActions(pairs.map(([a, b]) => ["ModifyColumn", a.tableId, a.id, { reverseCol: columnRef(schema, b.tableId, b.id) }]));
    return "";
  } catch (err) {
    return t("import.note.linkFailed", { error: reportError(err) });
  }
}

/** Row id of a column of the document, from the table's id and the column's. */
function columnRef(schema, tableId, colId) {
  const table = schema.tables.find((candidate) => candidate.tableId === tableId);
  return table && schema.allColumns.find((col) => col.parentId === table.tableRef && col.colId === colId)?.id;
}

/** Row id of the column `col.visibleColId` in the table `col` refers to. */
const displayColumnRef = (schema, col) => columnRef(schema, splitType(col.type).arg, col.visibleColId);
