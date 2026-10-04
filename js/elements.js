/**
 * The kinds of information a column carries besides its type, which Export and Import let the user keep or
 * leave out as a whole. Each is counted over the columns that really carry it, so that only those are offered.
 */

import { optionKinds, selectOptions } from "./widgetOptions.js";

export const ELEMENTS = ["labels", "descriptions", "choices", "options", "displayColumns", "twoWay", "formulas"];

/** The i18n key of the name of each element. */
export const ELEMENT_KEYS = {
  labels: "element.labels",
  descriptions: "element.descriptions",
  choices: "element.choices",
  options: "element.options",
  displayColumns: "element.displayColumns",
  twoWay: "element.twoWay",
  formulas: "element.formulas",
};

/** Which elements a column carries: a column of the export schema (`colId`) or one resolved from a text (`id`). */
function elementsOf(col) {
  const kinds = optionKinds(col.widgetOptions);
  return {
    labels: Boolean(col.label) && col.label !== (col.colId ?? col.id),
    descriptions: Boolean(col.description),
    choices: kinds.choices,
    options: kinds.display,
    displayColumns: Boolean(col.visibleColId),
    twoWay: Boolean(col.reverseColId),
    formulas: Boolean(col.formula?.trim()),
  };
}

/** How many of `columns` carry each element. */
export function elementCounts(columns) {
  const found = columns.map(elementsOf);
  return Object.fromEntries(ELEMENTS.map((element) => [element, found.filter((has) => has[element]).length]));
}

/** The sum of several `elementCounts`. */
export const sumCounts = (list) => Object.fromEntries(ELEMENTS.map((element) => [element, list.reduce((total, counts) => total + counts[element], 0)]));

/**
 * `col` as if it carried none of the `omitted` elements (a Set), but for its formula, which each tab takes
 * care of in its own way: Export writes the column as plain data, Import creates it empty unless told otherwise.
 */
export function omitElements(col, omitted) {
  return {
    ...col,
    label: omitted.has("labels") ? null : col.label,
    description: omitted.has("descriptions") ? null : col.description,
    widgetOptions: selectOptions(col.widgetOptions, { choices: !omitted.has("choices"), display: !omitted.has("options") }),
    visibleColId: omitted.has("displayColumns") ? null : col.visibleColId,
    reverseColId: omitted.has("twoWay") ? null : col.reverseColId,
  };
}
