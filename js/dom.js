/** DOM construction without innerHTML: untrusted text only ever reaches the page through textContent, properties or text nodes. */

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

/** A function that shows one message (nothing for a falsy one) in `region`, scrolled into view. */
export function statusWriter(region) {
  return (message, level = "info") => {
    region.replaceChildren(...(message ? [buildElement("p", { class: `status status-${level}`, text: message })] : []));
    if (message) region.scrollIntoView({ block: "nearest" });
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

/** A checkbox standing for a group: ticked when all of its `total` are, in between when only some are. */
export function syncMasterCheckbox(box, ticked, total) {
  box.checked = total > 0 && ticked === total;
  box.indeterminate = ticked > 0 && ticked < total;
}

/** Marks the wrapper of the checked radio with `is-checked`: the styles do not rely on :has(). */
export function syncCheckedClass(radios, className, wrapperSelector) {
  for (const radio of radios) radio.closest(wrapperSelector)?.classList.toggle(className, radio.checked);
}
