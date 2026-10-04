import { el } from "./dom.js";
import { t, tn } from "./i18n.js";
import { ELEMENTS, ELEMENT_HINTS, ELEMENT_KEYS, ELEMENT_UNITS } from "./elements.js";

const MAX_NAMED = 2; // the summary names the elements left out when there are this few

/** What the group says of the choice while it is folded: everything is kept, nothing, the few elements left out, or how many are kept. */
export function choiceSummary(offered, isKept) {
  const left = offered.filter((element) => !isKept(element));
  if (left.length === 0) return t("elements.summary.all");
  if (left.length === offered.length) return t("elements.summary.none");
  if (left.length > MAX_NAMED) return t("elements.summary.some", { kept: offered.length - left.length, total: offered.length });
  return t("elements.summary.without", { names: left.map((element) => t(ELEMENT_KEYS[element]).toLowerCase()).join(", ") });
}

/**
 * Makes in `list` one checkbox for each element, and returns the function that shows them: it hides those that no
 * column carries, says how many do, and ticks what `isKept` says, then tells whether any is left to choose from.
 * `onToggle(element, kept)` hears the user; `describedBy` names, per element, the paragraph that explains it further;
 * `summary` is where the choice is written for the user who leaves the group folded.
 * Each box is named by the element and its count, and described by the line under the name.
 * The boxes are made once, so that showing them again never takes the keyboard from the one that has it.
 */
export function elementsPicker(list, onToggle, { describedBy = {}, summary } = {}) {
  const rows = ELEMENTS.map((element) => {
    const id = `${list.id}-${element}`;
    const name = el("span", { class: "element-name", id: `${id}-name` });
    const hint = el("span", { class: "element-hint", id: `${id}-hint` });
    const count = el("span", { class: "tag", id: `${id}-count` });
    const box = el("input", { type: "checkbox", "aria-labelledby": `${name.id} ${count.id}`, "aria-describedby": [hint.id, describedBy[element]].filter(Boolean).join(" ") });
    box.addEventListener("change", () => onToggle(element, box.checked));
    const item = el("li", {}, [el("label", {}, [box, el("span", { class: "element-text" }, [el("span", { class: "element-head" }, [name, count]), hint])])]);
    return { element, box, name, hint, count, item };
  });
  list.replaceChildren(...rows.map(({ item }) => item));

  return (counts, isKept) => {
    for (const { element, box, name, hint, count, item } of rows) {
      item.hidden = counts[element] === 0;
      box.checked = isKept(element);
      name.textContent = t(ELEMENT_KEYS[element]);
      hint.textContent = t(ELEMENT_HINTS[element]);
      count.textContent = tn(ELEMENT_UNITS[element] ?? "common.columnsCount", counts[element]);
    }
    const offered = ELEMENTS.filter((element) => counts[element] > 0);
    if (summary) summary.textContent = choiceSummary(offered, isKept);
    return offered.length > 0;
  };
}
