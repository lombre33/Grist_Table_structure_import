/**
 * The confirmation the Import tab asks for before it writes in the document: a modal dialog that says what will be
 * added and that nothing which exists is touched. Cancelling, with the button or with Escape, writes nothing and
 * leaves the preview as it was.
 */

import { buildElement, byIds, trapFocus } from "./dom.js";
import { translate, translatePlural } from "./i18n.js";
import { callsRequest, isComputed } from "./importer.js";
import { modeOf } from "./importUi.js";
import { batchOf, withFormulas } from "./importState.js";
import { targetTable } from "./importView.js";

/** What the dialog says for what the button is about to do (`ctx`: see importTab.js): `{ title, intro, lines, notes, action }`. */
export function confirmationOf(ctx) {
  const { ui, state } = ctx;
  let title, intro, lines, columns;
  if (modeOf(ui) === "create") {
    const tables = batchOf(state);
    title = translatePlural("import.confirm.createTitle", tables.length);
    intro = translate("import.confirm.createIntro");
    lines = tables.map((table) => translate("import.confirm.tableLine", { tableId: table.id, columnsPhrase: translatePlural("common.columnsCount", table.columns.length) }));
    columns = tables.flatMap((table) => table.columns.map((col) => ({ ...col, tableId: table.id })));
  } else {
    const target = targetTable(ctx).tableId;
    columns = state.existing.columns.filter((col) => col.isNew && !state.existing.excluded.has(col.id)).map((col) => ({ ...col, tableId: target }));
    title = translate("import.confirm.addTitle", { table: target });
    intro = translatePlural("import.confirm.addIntro", columns.length);
    lines = columns.map((col) => col.id);
  }
  return { title, intro, lines, notes: formulaNotes(state, columns), action: ui.actionBtn.textContent }; // the button of the dialog says what the one that opened it said
}

/** What the user is told about the formulas they are about to run: that they will, and which of them can send data out. */
function formulaNotes(state, columns) {
  if (!withFormulas(state) || !columns.some(isComputed)) return [];
  const requesting = columns.filter(callsRequest).map((col) => `${col.tableId}.${col.id}`);
  return [translate("import.confirm.formulas"), ...(requesting.length > 0 ? [translatePlural("import.confirm.request", requesting.length, { columns: requesting.join(", ") })] : [])];
}

/** Wires the dialog once; the function it returns shows it for the texts given and tells, once it is closed, whether the user confirmed. */
export function createConfirmation() {
  const ui = byIds({ dialog: "confirm-dialog", title: "confirm-title", intro: "confirm-intro", list: "confirm-list", notes: "confirm-notes", cancelBtn: "confirm-cancel-btn", okBtn: "confirm-ok-btn" });
  let settle = () => {}; // gives the answer to whoever asked, once
  trapFocus(ui.dialog);

  /** The answer is given in the click itself: the page does not wait for the dialog's own `close` event to go on, since a task could run in between. */
  const answer = (confirmed) => {
    const give = settle;
    settle = () => {};
    ui.dialog.close();
    give(confirmed);
  };
  ui.cancelBtn.addEventListener("click", () => answer(false));
  ui.okBtn.addEventListener("click", (event) => {
    if (event.detail > 1) return; // the second click of a double click on the button that opened the dialog may land here: it is not a decision
    answer(true);
  });
  ui.dialog.addEventListener("close", () => answer(false)); // Escape: the browser has closed it, and that is a no
  ui.okBtn.addEventListener("keydown", (event) => {
    if (event.repeat) event.preventDefault(); // a key held down since the button that opened the dialog is not a decision
  });

  return ({ title, intro, lines, notes, action }) =>
    new Promise((resolve) => {
      ui.title.textContent = title;
      ui.intro.textContent = intro;
      ui.list.replaceChildren(...lines.map((text) => buildElement("li", { text })));
      ui.notes.replaceChildren(...notes.map((text) => buildElement("p", { class: "status status-warning", text })));
      ui.okBtn.textContent = action;
      settle = resolve;
      ui.dialog.showModal();
      (notes.length > 0 ? ui.cancelBtn : ui.okBtn).focus(); // Enter confirms, Escape cancels; with a caution to read, Enter cancels: confirming takes a deliberate click
    });
}
