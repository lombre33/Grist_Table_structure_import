/** DOM construction without innerHTML: untrusted text only ever reaches the page through textContent, properties or text nodes. */

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
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
  return el("li", {}, [el("label", {}, [el("input", { type: "checkbox", value, checked }), el("span", { text })])]);
}

/** A function that shows one message (nothing for a falsy one) in `region`, scrolled into view. */
export function statusWriter(region) {
  return (message, level = "info") => {
    region.replaceChildren(...(message ? [el("p", { class: `status status-${level}`, text: message })] : []));
    if (message) region.scrollIntoView({ block: "nearest" });
  };
}

/** Marks the wrapper of the checked radio with `is-checked`: the styles do not rely on :has(). */
export function syncCheckedClass(radios, className, wrapperSelector) {
  for (const radio of radios) radio.closest(wrapperSelector)?.classList.toggle(className, radio.checked);
}
