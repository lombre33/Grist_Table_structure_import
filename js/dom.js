/** DOM construction without innerHTML: untrusted text only ever reaches the page through textContent, properties or text nodes. */

import { onLocaleChange } from "./i18n.js";

export const $ = (id) => document.getElementById(id);

/** The elements of the page whose ids are listed: `byIds({ list: "export-table-list" })` is `{ list: <that element> }`. */
export const byIds = (ids) => Object.fromEntries(Object.entries(ids).map(([name, id]) => [name, $(id)]));

/** What `buildElement` does not take as a key: it would write markup or code, which is not what its text and properties are for. */
const MARKUP_OR_CODE_KEY = /^(?:innerHTML|outerHTML|srcdoc|on[a-z]+)$/i;

export function buildElement(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (MARKUP_OR_CODE_KEY.test(key)) throw new Error(`buildElement does not take "${key}": it would write markup or code`);
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

/** One row of a checklist: a checkbox and its text. */
export function checklistItem(value, text, checked = false) {
  return buildElement("li", {}, [buildElement("label", {}, [buildElement("input", { type: "checkbox", value, checked }), buildElement("span", { text })])]);
}

/**
 * A function that shows one message (nothing for a falsy one) in `region`, scrolled into view. A message given as a
 * function of no argument is the text it returns, written again when the language changes.
 */
export function statusWriter(region) {
  let shown = null; // { message, level }
  const write = () => {
    const message = typeof shown?.message === "function" ? shown.message() : shown?.message;
    region.replaceChildren(...(message ? [buildElement("p", { class: `status status-${shown.level}`, text: message })] : []));
    return message;
  };
  onLocaleChange(() => {
    if (typeof shown?.message === "function") write();
  });
  return (message, level = "info") => {
    shown = { message, level };
    if (write()) region.scrollIntoView({ block: "nearest" });
  };
}

/**
 * A control that was disabled has lost the keyboard focus, which the browser takes off it at the next frame
 * only: give the focus to `control` (to the disabled one, by default) once it is usable again, if nobody
 * else has it, without scrolling to it.
 */
export function restoreFocus(control, disabled = control) {
  const holder = document.activeElement;
  if ((holder === document.body || holder === disabled) && !control.disabled) control.focus({ preventScroll: true });
}

const FOCUSABLE = 'button, input, select, textarea, summary, a[href], [tabindex]:not([tabindex="-1"])';

/** The controls that Tab stops on in `container`, in order: a group of radios is one stop, its checked one. */
function tabStops(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter((control) => {
    if (control.disabled || control.getClientRects().length === 0) return false;
    return control.type !== "radio" || control.checked || !container.querySelector(`input[type="radio"][name="${control.name}"]:checked`);
  });
}

/**
 * Keeps Tab and Shift+Tab inside `dialog` while it is open. In a frame, as in Grist, the focus would otherwise leave
 * for the page around it, where Escape no longer reaches the dialog.
 */
export function trapFocus(dialog) {
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const stops = tabStops(dialog);
    const edge = event.shiftKey ? stops[0] : stops.at(-1);
    if (stops.length > 0 && document.activeElement === edge) {
      event.preventDefault();
      (event.shiftKey ? stops.at(-1) : stops[0]).focus();
    }
  });
}

/** A checkbox standing for a group: ticked when all of its `total` are, in between when only some are. */
export function syncMasterCheckbox(box, ticked, total) {
  box.checked = total > 0 && ticked === total;
  box.indeterminate = ticked > 0 && ticked < total;
}

/** Marks the wrapper of the checked radio with `is-checked`: the styles do not rely on :has(). */
export function syncCheckedClass(radios, className, wrapperSelector) {
  for (const radio of radios) radio.closest(wrapperSelector)?.classList.toggle(className, radio.checked);
}
