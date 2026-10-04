import { el } from "./dom.js";
import { t, tn } from "./i18n.js";
import { ELEMENTS, ELEMENT_KEYS } from "./elements.js";

/**
 * Makes in `list` one checkbox for each element, and returns the function that shows them: it hides those that no
 * column carries, says how many do, and ticks what `isKept` says, then tells whether any is left to choose from.
 * `onToggle(element, kept)` hears the user; `describedBy` names, per element, the paragraph that explains it.
 * The boxes are made once, so that showing them again never takes the keyboard from the one that has it.
 */
export function elementsPicker(list, onToggle, describedBy = {}) {
  const rows = ELEMENTS.map((element) => {
    const box = el("input", { type: "checkbox", ...(describedBy[element] && { "aria-describedby": describedBy[element] }) });
    box.addEventListener("change", () => onToggle(element, box.checked));
    const name = el("span");
    const count = el("span", { class: "tag" });
    return { element, box, name, count, item: el("li", {}, [el("label", {}, [box, name, " ", count])]) }; // the space makes the box's name read "Libellés 2 colonnes"
  });
  list.replaceChildren(...rows.map(({ item }) => item));

  return (counts, isKept) => {
    for (const { element, box, name, count, item } of rows) {
      item.hidden = counts[element] === 0;
      box.checked = isKept(element);
      name.textContent = t(ELEMENT_KEYS[element]);
      count.textContent = tn("common.columnsCount", counts[element]);
    }
    return ELEMENTS.some((element) => counts[element] > 0);
  };
}
