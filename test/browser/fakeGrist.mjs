/**
 * An in-memory stand-in for the `grist` object of a widget, for interface
 * tests that need no Grist: fixed metadata, every batch of actions recorded in
 * `calls`, results echoing what was asked (the real ids come from test/grist).
 *
 * Existing_Table references Other_Table (Owner, shown through its Label) and
 * has a summary table; Mood carries a label, a description and styled choices
 * whose text holds parentheses; Other_Table has a description of its own.
 */

const TABLES = {
  id: [1, 2, 3, 4],
  tableId: ["Existing_Table", "Other_Table", "Existing_Table_summary_Age", "Standalone_Table"],
  summarySourceTable: [0, 0, 1, 0],
  rawViewSectionRef: [101, 102, 103, 104],
};

const SECTIONS = { id: [101, 102, 103, 104], description: ["", "Table liée, pour le choix des valeurs.", "", ""] };

const MOOD_OPTIONS = {
  choices: ["Content (ok)", "Neutre", "Absent"],
  choiceOptions: {
    "Content (ok)": { fillColor: "#2A9D53", textColor: "#FFFFFF", fontBold: true },
    Absent: { fillColor: "#C0392B", textColor: "#FFFFFF" },
  },
  alignment: "center",
};

const COLUMNS = {
  id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  parentId: [1, 1, 1, 1, 1, 1, 2, 2, 4, 4],
  colId: ["manualSort", "Name", "Age", "Computed", "Mood", "Owner", "manualSort", "Label", "manualSort", "Info"],
  type: ["ManualSortPos", "Text", "Int", "Numeric", "Choice", "Ref:Other_Table", "ManualSortPos", "Text", "ManualSortPos", "Text"],
  isFormula: [false, false, false, true, false, false, false, false, false, false],
  formula: ["", "", "", "$Age * 2", "", "", "", "", "", ""],
  parentPos: [1, 2, 3, 4, 5, 6, 1, 2, 1, 2],
  label: ["manualSort", "Name", "Age", "Computed", "Humeur", "Owner", "manualSort", "Label", "manualSort", "Info"],
  description: ["", "", "", "", "Humeur du bénévole ce jour.", "", "", "", "", ""],
  widgetOptions: ["", "", "", "", JSON.stringify(MOOD_OPTIONS), "", "", "", "", ""],
  visibleCol: [0, 0, 0, 0, 0, 8, 0, 0, 0, 0],
};

const echo = (action) => {
  const [name, tableId, second] = action;
  if (name === "AddTable") return { table_id: tableId, columns: second.map((col) => col.id) };
  return name === "AddVisibleColumn" ? { colId: second } : null;
};

/** What AddTable leaves in the metadata that the widget reads: the table, and its raw data widget (the next ones in line). */
function recordTable(metadata, tableId) {
  const { _grist_Tables: tables, _grist_Views_section: sections } = metadata;
  const section = Math.max(...sections.id) + 1;
  tables.id.push(Math.max(...tables.id) + 1);
  tables.tableId.push(tableId);
  tables.summarySourceTable.push(0);
  tables.rawViewSectionRef.push(section);
  sections.id.push(section);
  sections.description.push("");
}

/** The tables of `metadata` whose id is not in `only` are gone (their columns stay, which nothing reads). */
function keepOnly(metadata, only) {
  const tables = metadata._grist_Tables;
  const kept = tables.tableId.map((tableId) => only.includes(tableId));
  for (const key of Object.keys(tables)) tables[key] = tables[key].filter((_, i) => kept[i]);
}

/** `extraTables` more tables (Ledger_1, Ledger_2…), without a column, for a long list; `onlyTables` lists the ids of the tables the document has, for a short one. */
export function fakeGrist({ delay = 0, extraTables = 0, onlyTables = null } = {}) {
  const calls = [];
  const metadata = structuredClone({ _grist_Tables: TABLES, _grist_Tables_column: COLUMNS, _grist_Views_section: SECTIONS });
  if (onlyTables) keepOnly(metadata, onlyTables);
  const extraIds = Array.from({ length: extraTables }, (_, i) => `Ledger_${i + 1}`);
  for (const tableId of extraIds) recordTable(metadata, tableId);
  return {
    calls,
    docApi: {
      listTables: async () => [...TABLES.tableId, ...extraIds],
      fetchTable: async (tableId) => metadata[tableId] ?? Promise.reject(new Error(`unstubbed fetchTable(${tableId})`)),
      applyUserActions: async (actions) => {
        calls.push(actions);
        for (const [name, tableId] of actions) if (name === "AddTable") recordTable(metadata, tableId);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return { retValues: actions.map(echo) };
      },
    },
  };
}
