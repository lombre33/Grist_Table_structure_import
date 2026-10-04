/**
 * The list of the tables of the document that the Export tab offers: a box for each, with the button that unfolds
 * the choice of its columns, the box that takes all the tables shown, and the search that narrows the list as it is
 * typed. `excluded` (table id → Set of the ids of the columns left out) belongs to the tab: the choices of columns
 * are written there.
 */

import { byIds, buildElement, syncMasterCheckbox } from "./dom.js";
import { queryMatcher } from "./search.js";
import { translate, translatePlural } from "./i18n.js";

const SEARCH_FROM = 7; // a shorter list is read faster than a table is typed

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

const tableBoxes = ({ list }) => Array.from(list.querySelectorAll("input.table-box"));
const selectedIds = (ui) => tableBoxes(ui).filter((box) => box.checked).map((box) => box.value);

/** Shows the tables the search holds (all of them when nothing is searched) and returns their boxes. */
function filterTables({ list, search }) {
  const matches = queryMatcher(search.value);
  const shown = [];
  for (const item of list.children) {
    const box = item.querySelector("input.table-box");
    item.hidden = !matches(box.value);
    if (!item.hidden) shown.push(box);
  }
  return shown;
}

/** What the search found, written where it is typed and read by a screen reader, with the ticked tables it hides; nothing when nothing is searched. */
function renderSearchStatus(ui, shown) {
  const { list, search, searchStatus } = ui;
  const query = search.value.trim();
  const total = list.children.length;
  const hiddenTicked = selectedIds(ui).length - shown.filter((box) => box.checked).length;
  const found = shown.length === 0 ? translate("export.search.none", { query }) : translatePlural("export.search.count", shown.length, { total });
  const text = query && total > 0 ? [found, hiddenTicked > 0 && translatePlural("export.search.hiddenTicked", hiddenTicked)].filter(Boolean).join(" ") : "";
  if (searchStatus.textContent !== text) searchStatus.textContent = text; // a screen reader says again what is written again
}

/** What the user does in the list: tick, untick, search, take all the tables shown. */
function wire(ui, onChange) {
  ui.list.addEventListener("change", onChange); // the boxes of the columns too: their own listener has written the choice by the time this one hears it
  ui.search.addEventListener("input", onChange);
  ui.search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.search.value) {
      ui.search.value = ""; // like the search fields of the browsers that clear them
      onChange();
    }
  });
  ui.selectAll.addEventListener("change", () => {
    for (const box of tableBoxes(ui)) if (!box.closest("li").hidden) box.checked = ui.selectAll.checked; // those shown: the others are not in sight
    onChange();
  });
}

const isLeftOut = (excluded, tableId, colId) => Boolean(excluded.get(tableId)?.has(colId));

/** A box for each column of `table`, ticked unless it was left out; the choice is written to `excluded` as it is made. */
function columnBoxes(table, excluded) {
  return table.columns.map((colId) => {
    const box = buildElement("input", { type: "checkbox", checked: !isLeftOut(excluded, table.tableId, colId) });
    box.addEventListener("change", () => {
      const left = excluded.get(table.tableId) ?? new Set();
      if (box.checked) left.delete(colId);
      else left.add(colId);
      excluded.set(table.tableId, left);
    });
    return buildElement("label", {}, [box, buildElement("span", { text: colId })]);
  });
}

/**
 * The row of a table: its box, and the button that unfolds the choice of its columns, whose boxes are made when it is
 * first asked for. The button says how many columns are kept once some are left out.
 */
function tableRow(table, ticked, excluded, position) {
  const box = buildElement("input", { type: "checkbox", class: "table-box", value: table.tableId, checked: ticked });
  const count = buildElement("span", { class: "tag", hidden: true });
  const columns = buildElement("div", { class: "columns-list", id: `export-columns-${position}`, role: "group", hidden: true });
  const toggle = buildElement("button", { type: "button", class: "columns-toggle", "aria-expanded": "false", "aria-controls": columns.id }, [count]);
  toggle.addEventListener("click", () => {
    const opening = columns.hidden;
    if (opening && columns.childElementCount === 0) columns.replaceChildren(...columnBoxes(table, excluded));
    columns.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
  });
  const item = buildElement("li", {}, [buildElement("div", { class: "table-row" }, [buildElement("label", {}, [box, buildElement("span", { text: table.tableId })]), toggle]), columns]);
  return { table, item, count, toggle, columns };
}

/** Writes again, in the language of the page, what the button and the group of a row say, and how many columns are kept. */
function renderColumnChoice({ table, count, toggle, columns }, excluded) {
  const kept = table.columns.filter((colId) => !isLeftOut(excluded, table.tableId, colId)).length;
  const some = kept < table.columns.length;
  count.hidden = !some;
  count.textContent = some ? translatePlural("export.columns.some", kept, { total: table.columns.length }) : "";
  const name = translate("export.columns.toggle", { tableId: table.tableId });
  toggle.setAttribute("aria-label", some ? `${name}, ${count.textContent}` : name);
  toggle.title = name;
  columns.setAttribute("aria-label", translate("export.columns.group", { tableId: table.tableId }));
}

/** `onChange()` is called when the user ticks, unticks or searches: what depends on the tables ticked is written again then. */
export function createTableList({ onChange, excluded }) {
  const ui = tableListUi();
  let rows = [];
  wire(ui, onChange);

  return {
    selected: () => selectedIds(ui),

    /** Writes again what the search and the ticks decide: the tables shown, the box that takes them all, what the search says. */
    render() {
      const shown = filterTables(ui);
      syncMasterCheckbox(ui.selectAll, shown.filter((box) => box.checked).length, shown.length);
      ui.selectAll.disabled = shown.length === 0;
      ui.selectAllText.textContent = translate(ui.search.value.trim() ? "export.selectAllShown" : "export.selectAll");
      renderSearchStatus(ui, shown);
      for (const row of rows) renderColumnChoice(row, excluded);
    },

    /** The list is being read again: nothing to show, nothing to search. */
    hide() {
      ui.empty.hidden = ui.searchRow.hidden = ui.selectAllRow.hidden = true;
      rows = [];
      ui.list.replaceChildren();
    },

    /** Lists the tables (`[{ tableId, columns }]`, with the ids of the columns), those of `kept` being ticked. */
    show(tables, kept) {
      ui.empty.hidden = tables.length > 0;
      ui.searchRow.hidden = tables.length < SEARCH_FROM;
      ui.selectAllRow.hidden = tables.length < 2;
      if (ui.searchRow.hidden) ui.search.value = ""; // what was typed for a longer list cannot be seen, nor undone
      rows = tables.map((table, position) => tableRow(table, kept.has(table.tableId), excluded, position));
      ui.list.replaceChildren(...rows.map((row) => row.item));
    },

    /** Ticks the tables of `ids`, and shows them even if what is searched hides them. */
    tick(ids) {
      for (const box of tableBoxes(ui)) if (ids.includes(box.value)) box.checked = true;
      if (!ids.every(queryMatcher(ui.search.value))) ui.search.value = "";
    },
  };
}
