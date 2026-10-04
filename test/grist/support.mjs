import { after } from "node:test";
import { connect, rows } from "./client.mjs";

export const instance = await connect().catch((err) => {
  throw new Error(`No usable Grist instance (set GRIST_URL, see README "Tests against a real Grist"): ${err.message}`);
});

after(() => instance.cleanup());

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

import { parseGristSchema } from "../../js/parser.js";
import { createTables, resolveColumns, defaultTableId } from "../../js/importer.js";

/**
 * Parses Code View text and creates its tables in `doc` as the Import tab does
 * with its defaults. `ids` renames tables, `exclude` lists unchecked columns, `withFormulas`
 * ticks the option that imports formulas, `omit` lists the elements (see js/elements.js) left out.
 */
export async function importText(doc, text, { ids = {}, exclude = {}, withFormulas = false, omit = [] } = {}) {
  const { tables } = parseGristSchema(text);
  const known = await doc.tableIds();
  const destination = new Map(tables.map((table) => [table.tableId, ids[table.tableId] ?? defaultTableId(table.tableId)]));
  const entries = tables.map((table) => {
    const left = new Set(exclude[table.tableId]);
    const { columns } = resolveColumns(table, destination, known, { excluded: left, withFormulas, omit: new Set(omit) });
    return { id: destination.get(table.tableId), columns: columns.filter((col) => !left.has(col.id)) };
  });
  return createTables(doc.grist, entries, { withFormulas });
}

/**
 * What a document holds, read straight from the metadata (not through the
 * widget): for each table, its visible columns in position order.
 */
export async function snapshot(doc) {
  const [tables, columns] = await Promise.all([doc.fetchTable("_grist_Tables"), doc.fetchTable("_grist_Tables_column")]);
  const all = rows(columns);
  const byRef = new Map(all.map((col) => [col.id, col]));
  const visible = (col) => col.colId !== "manualSort" && !col.colId.startsWith("gristHelper_");
  return Object.fromEntries(
    rows(tables)
      .filter((table) => !table.summarySourceTable)
      .map((table) => [
        table.tableId,
        all
          .filter((col) => col.parentId === table.id && visible(col))
          .sort((a, b) => a.parentPos - b.parentPos)
          .map((col) => ({
            id: col.colId,
            type: col.type,
            isFormula: Boolean(col.isFormula),
            formula: col.formula,
            label: col.label,
            untied: Boolean(col.untieColIdFromLabel),
            description: col.description,
            widgetOptions: col.widgetOptions ? JSON.parse(col.widgetOptions) : null,
            visibleCol: byRef.get(col.visibleCol)?.colId ?? null,
            reverseCol: byRef.get(col.reverseCol)?.colId ?? null,
          })),
      ])
  );
}

import { fetchDocSchema, buildExportSchema, omitFromExport } from "../../js/schema.js";
import { generateCode } from "../../js/codeGenerator.js";

/**
 * Creates in `doc` the tables of `spec` (`{ TableId: [{ id, type, formula?,
 * label?, tied?, description?, widgetOptions?, visibleCol?, reverse? }] }`) the way Grist's own
 * interface does: columns first, then descriptions, display columns and two-way links
 * (`reverse`: the column of the target table this one is the counterpart of). A column with a
 * label has its id apart from it, unless `tied`.
 */
export async function buildSource(doc, spec) {
  const payload = ({ id, type, formula, trigger, label, widgetOptions }) =>
    column(id, type, { isFormula: formula !== undefined, formula: formula ?? trigger ?? "", label, widgetOptions: widgetOptions && JSON.stringify(widgetOptions) });
  await doc.apply(Object.entries(spec).map(([tableId, columns]) => ["AddTable", tableId, columns.map(payload)]));

  const followUps = [];
  for (const [tableId, columns] of Object.entries(spec)) {
    for (const { id, type, label, tied, description, visibleCol, reverse } of columns) {
      if (label && !tied) followUps.push(["ModifyColumn", tableId, id, { untieColIdFromLabel: true }]);
      if (description) followUps.push(["ModifyColumn", tableId, id, { description }]);
      if (reverse) followUps.push(["ModifyColumn", tableId, id, { reverseCol: await columnRef(doc, type.split(":")[1], reverse) }]);
      if (visibleCol) {
        const target = await columnRef(doc, type.split(":")[1], visibleCol);
        followUps.push(["ModifyColumn", tableId, id, { visibleCol: target }], ["SetDisplayFormula", tableId, null, await columnRef(doc, tableId, id), `$${id}.${visibleCol}`]);
      }
    }
  }
  if (followUps.length > 0) await doc.apply(followUps);
}

/** The Export tab's text for the given tables of `doc`, without the elements (see js/elements.js) in `omitted`. */
export async function exportText(doc, tableIds, omitted = []) {
  const { tables, allColumns } = await fetchDocSchema(doc.grist);
  return generateCode(omitFromExport(buildExportSchema(tables, allColumns, tableIds), new Set(omitted)));
}

/** Builds `spec` in a first document, exports it, imports the text in a second one (with the formulas if `withFormulas`). */
export async function roundTrip(spec, options) {
  const source = await instance.newDoc("round trip: source");
  await buildSource(source, spec);
  const text = await exportText(source, Object.keys(spec));
  const target = await instance.newDoc("round trip: target");
  const { note } = await importText(target, text, options);
  const result = { text, note, before: await snapshot(source), after: await snapshot(target) };
  await instance.cleanup([source.id, target.id]);
  return result;
}

const CHOICE_KEYS = new Set(["choices", "choiceOptions"]);
const onlyKeys = (options, keep) => {
  const kept = Object.fromEntries(Object.entries(options ?? {}).filter(([key]) => keep(key)));
  return Object.keys(kept).length > 0 ? kept : null;
};

/** What the engine holds of a column once an element has been left out: the column as it would be had it never had it. */
const WITHOUT = {
  labels: (col) => ({ ...col, label: col.id, untied: false }),
  descriptions: (col) => ({ ...col, description: "" }),
  choices: (col) => ({ ...col, widgetOptions: onlyKeys(col.widgetOptions, (key) => !CHOICE_KEYS.has(key)) }),
  options: (col) => ({ ...col, widgetOptions: onlyKeys(col.widgetOptions, (key) => CHOICE_KEYS.has(key)) }),
  displayColumns: (col) => ({ ...col, visibleCol: null }),
  twoWay: (col) => ({ ...col, reverseCol: null }),
};

/**
 * What an imported table must look like given the source's columns: data
 * columns first (as in Code View), formulas turned into empty data columns
 * unless `withFormulas`, the widgetOptions the widget agrees to carry (no
 * rulesOptions, the dropdown condition reduced to its text), and none of the
 * elements in `omit` (the formulas are `withFormulas`'s).
 */
export function expectedAfterImport(columns, { withFormulas = false, omit = [] } = {}) {
  const carried = (options) => {
    if (!options) return null;
    const { rulesOptions, dropdownCondition, ...rest } = options;
    const kept = { ...rest, ...(dropdownCondition && { dropdownCondition: { text: dropdownCondition.text } }) };
    return Object.keys(kept).length > 0 ? kept : null;
  };
  return [...columns.filter((col) => !col.isFormula), ...columns.filter((col) => col.isFormula)].map((col) =>
    omit.reduce((left, element) => WITHOUT[element]?.(left) ?? left, {
      ...col,
      isFormula: withFormulas && col.isFormula,
      formula: withFormulas ? col.formula : "",
      widgetOptions: carried(col.widgetOptions),
    })
  );
}
