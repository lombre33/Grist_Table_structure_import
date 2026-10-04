import { byIds } from "./dom.js";

/** The elements of the Import tab, by name: what the other modules of the tab read and write. */
export const importUi = () => ({
  ...byIds({
    sourceInput: "source-input",
    analyzeBtn: "analyze-btn",
    clearBtn: "clear-btn",
    modeBlock: "mode-block",
    previewSection: "preview-section",
    previewHeading: "preview-heading",
    sourcePickerRow: "table-picker-row",
    sourceSelect: "table-select",
    checklistRow: "table-multi-picker-row",
    checklist: "table-multi-select",
    tableIdRow: "table-id-row",
    tableIdsLabel: "table-ids-label",
    tableIdsList: "table-ids-list",
    targetRow: "target-table-row",
    targetSelect: "target-table-select",
    targetError: "target-table-error",
    columnsPreview: "columns-preview",
    statusHeader: "status-column-header",
    selectAllColumns: "columns-select-all",
    columnsBody: "columns-preview-body",
    elementsBox: "import-elements",
    elementsList: "import-elements-list",
    formulasHint: "formulas-hint",
    warningsBlock: "warnings-block",
    warningsList: "warnings-list",
    createActions: "create-actions",
    actionBtn: "action-btn",
    announcement: "import-announcement",
    statusRegion: "import-status-region",
  }),
  modeRadios: Array.from(document.querySelectorAll('input[name="import-mode"]')),
});

/** What the user chose to do with the code: "create" (a new table) or "existing" (columns added to a table of the document). */
export const modeOf = (ui) => ui.modeRadios.find((radio) => radio.checked)?.value ?? "create";
