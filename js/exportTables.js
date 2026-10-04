/**
 * The list of the tables of the document that the Export tab offers: a box for each, the one that takes them
 * all (the ones shown), and the search that narrows the list as it is typed.
 */

import { byIds, checklistItem, syncMasterCheckbox } from "./dom.js";
import { queryMatcher } from "./search.js";
import { t, tn } from "./i18n.js";

const tableListUi = () =>
  byIds({
    list: "export-table-list",
    searchRow: "export-search-row",
    search: "export-search",
    searchStatus: "export-search-status",
    selectAllRow: "export-select-all-row",
    selectAll: "export-select-all",
    selectAllText: "export-select-all-text",
    empty: "export-tables-empty",
  });

const selectedIds = ({ list }) => Array.from(list.querySelectorAll("input:checked"), (input) => input.value);

/** Shows the tables the search holds (all of them when nothing is searched) and returns their boxes. */
function filterTables({ list, search }) {
  const matches = queryMatcher(search.value);
  const shown = [];
  for (const item of list.children) {
    const box = item.querySelector("input");
    item.hidden = !matches(box.value);
    if (!item.hidden) shown.push(box);
  }
  return shown;
}

/** What the search found, written where it is typed and read by a screen reader, with the ticked tables it hides; nothing when nothing is searched. */
function renderSearchStatus({ list, search, searchStatus }, shown) {
  const query = search.value.trim();
  const total = list.children.length;
  const hiddenTicked = selectedIds({ list }).length - shown.filter((box) => box.checked).length;
  const found = shown.length === 0 ? t("export.search.none", { query }) : tn("export.search.count", shown.length, { total });
  const text = query && total > 0 ? [found, hiddenTicked > 0 && tn("export.search.hiddenTicked", hiddenTicked)].filter(Boolean).join(" ") : "";
  if (searchStatus.textContent !== text) searchStatus.textContent = text; // a screen reader says again what is written again
}

/** What the user does in the list: tick, untick, search, take all the tables shown. */
function wire(ui, onChange) {
  ui.list.addEventListener("change", onChange);
  ui.search.addEventListener("input", onChange);
  ui.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.search.value) {
      ui.search.value = ""; // like the search fields of the browsers that clear them
      onChange();
    }
  });
  ui.selectAll.addEventListener("change", () => {
    for (const input of ui.list.querySelectorAll("li:not([hidden]) input")) input.checked = ui.selectAll.checked; // those shown: the others are not in sight
    onChange();
  });
}

/** `onChange()` is called when the user ticks, unticks or searches: what depends on the tables ticked is written again then. */
export function createTableList({ onChange }) {
  const ui = tableListUi();
  wire(ui, onChange);

  return {
    selected: () => selectedIds(ui),

    /** Writes again what the search and the ticks decide: the tables shown, the box that takes them all, what the search says. */
    render() {
      const shown = filterTables(ui);
      syncMasterCheckbox(ui.selectAll, shown.filter((box) => box.checked).length, shown.length);
      ui.selectAll.disabled = shown.length === 0;
      ui.selectAllText.textContent = t(ui.search.value.trim() ? "export.selectAllShown" : "export.selectAll");
      renderSearchStatus(ui, shown);
    },

    /** The list is being read again: nothing to show, nothing to search. */
    hide() {
      ui.empty.hidden = ui.searchRow.hidden = ui.selectAllRow.hidden = true;
      ui.list.replaceChildren();
    },

    /** Lists the tables (`[{ tableId }]`), those of `kept` being ticked. */
    show(tables, kept) {
      ui.empty.hidden = tables.length > 0;
      ui.searchRow.hidden = ui.selectAllRow.hidden = tables.length === 0;
      ui.list.replaceChildren(...tables.map((table) => checklistItem(table.tableId, table.tableId, kept.has(table.tableId))));
    },

    /** Ticks the tables of `ids`, and shows them even if what is searched hides them. */
    tick(ids) {
      for (const input of ui.list.querySelectorAll("input")) if (ids.includes(input.value)) input.checked = true;
      if (!ids.every(queryMatcher(ui.search.value))) ui.search.value = "";
    },
  };
}
