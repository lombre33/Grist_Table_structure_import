/**
 * An in-memory stand-in for the `grist` object of a widget, for interface
 * tests that need no Grist: fixed metadata, every batch of actions recorded in
 * `calls`, results echoing what was asked (the real ids come from test/grist).
 *
 * Existing_Table references Other_Table (Owner, shown through its Label) and
 * has a summary table; Mood carries a label, a description and styled choices
 * whose text holds parentheses.
 */

const TABLES = {
  id: [1, 2, 3, 4],
  tableId: ["Existing_Table", "Other_Table", "Existing_Table_summary_Age", "Standalone_Table"],
  summarySourceTable: [0, 0, 1, 0],
};

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

export function fakeGrist() {
  const calls = [];
  const metadata = { _grist_Tables: TABLES, _grist_Tables_column: COLUMNS };
  return {
    calls,
    docApi: {
      listTables: async () => TABLES.tableId,
      fetchTable: async (tableId) => metadata[tableId] ?? Promise.reject(new Error(`unstubbed fetchTable(${tableId})`)),
      applyUserActions: async (actions) => {
        calls.push(actions);
        return { retValues: actions.map(echo) };
      },
    },
  };
}
