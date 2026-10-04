import { test } from "node:test";
import assert from "node:assert/strict";
import { ELEMENTS, ELEMENT_KEYS, ELEMENT_UNITS, elementCounts, omitElements, omitTable, sumCounts } from "../js/elements.js";
import { choiceSummary } from "../js/elementsPicker.js";
import { plain } from "./helpers.mjs";

const none = Object.fromEntries(ELEMENTS.map((element) => [element, 0]));

/** A column as the Export tab's schema holds it (`colId`), and as the Import tab resolves one from a text (`id`). */
const exported = (extra = {}) => ({ colId: "Mood", type: "Choice", isFormula: false, formula: "", label: null, description: null, widgetOptions: null, visibleColId: null, reverseColId: null, ...extra });
const imported = (extra = {}) => ({ id: "Mood", kind: "data", formula: "", type: "Choice", widgetOptions: null, refTarget: null, label: null, description: null, visibleColId: null, reverseColId: null, ...extra });

const CARRIES_ALL = { label: "Humeur", description: "Du jour", widgetOptions: { choices: ["a"], alignment: "center" }, visibleColId: "Name", reverseColId: "Pets", formula: "$A" };

test("every element has a name to show", () => {
  assert.deepEqual(Object.keys(ELEMENT_KEYS), ELEMENTS);
});

test("a column that carries nothing besides its type counts for no element", () => {
  assert.deepEqual(elementCounts([exported(), imported()]), none);
  assert.deepEqual(elementCounts([]), none);
});

test("each element is counted over the columns that carry it, whichever shape the column has", () => {
  const columns = [exported({ ...CARRIES_ALL, isFormula: true }), imported({ ...CARRIES_ALL, kind: "formula" }), exported({ colId: "Other", description: "Only this" })];
  assert.deepEqual(elementCounts(columns), { labels: 2, descriptions: 3, tableDescriptions: 0, choices: 2, options: 2, displayColumns: 2, twoWay: 2, formulas: 2 });
});

test("a label that is the id says nothing, and a formula of blanks is no formula", () => {
  assert.deepEqual(elementCounts([exported({ label: "Mood", formula: " \n " }), imported({ label: "Mood", formula: "  " })]), none);
  assert.equal(elementCounts([exported({ label: "Humeur" })]).labels, 1);
});

test("a trigger formula, on a column that holds data, counts as a formula", () => {
  assert.equal(elementCounts([exported({ type: "Text", formula: "'new'" }), imported({ type: "Text", kind: "trigger", formula: "'new'" })]).formulas, 2);
});

test("what the widget options hold is counted as the Export would write it: choices with their styles apart from the rest", () => {
  const count = (widgetOptions) => {
    const { choices, options } = elementCounts([exported({ widgetOptions })]);
    return [choices, options];
  };
  assert.deepEqual(count({ choices: ["a"] }), [1, 0]);
  assert.deepEqual(count({ choiceOptions: { a: { fillColor: "#112233" } } }), [1, 0]);
  assert.deepEqual(count({ alignment: "center", wrap: true }), [0, 1]);
  assert.deepEqual(count({ choices: ["a"], choiceOptions: { a: { fontBold: true } }, numMode: "currency" }), [1, 1]);
  assert.deepEqual(count({ choices: [], rulesOptions: [{ fillColor: "#112233" }], wrap: "yes", choiceOptions: { a: { fillColor: "red" } } }), [0, 0], "nothing the Export would write");
  assert.deepEqual(count(null), [0, 0]);
});

test("sumCounts adds up the counts of several lists of columns", () => {
  const first = elementCounts([exported({ label: "Humeur", description: "d" })]);
  const second = elementCounts([exported({ label: "Autre" }), exported({ formula: "$A" })]);
  assert.deepEqual(sumCounts([first, second]), { ...none, labels: 2, descriptions: 1, formulas: 1 });
  assert.deepEqual(sumCounts([]), none);
});

const rich = () => ({
  id: "Mood",
  type: "Choice",
  formula: "$A",
  label: "Humeur",
  description: "Du jour",
  widgetOptions: { choices: ["a", "b"], choiceOptions: { a: { fillColor: "#112233" } }, alignment: "center" },
  visibleColId: "Name",
  reverseColId: "Pets",
});

test("omitElements takes out the elements asked and nothing else, leaving the column given as it was", () => {
  const original = rich();
  const without = (...elements) => omitElements(original, new Set(elements));
  assert.deepEqual(without(), rich(), "nothing asked, nothing taken");
  assert.deepEqual(without("labels"), { ...rich(), label: null });
  assert.deepEqual(without("descriptions"), { ...rich(), description: null });
  assert.deepEqual(without("displayColumns"), { ...rich(), visibleColId: null });
  assert.deepEqual(without("twoWay"), { ...rich(), reverseColId: null });
  assert.deepEqual(without("choices").widgetOptions, { alignment: "center" });
  assert.deepEqual(without("options").widgetOptions, { choices: ["a", "b"], choiceOptions: { a: { fillColor: "#112233" } } });
  assert.equal(without("choices", "options").widgetOptions, null);
  assert.deepEqual(without("formulas"), rich(), "the formulas are for each tab to deal with");
  assert.deepEqual(original, rich(), "not changed");
});

test("omitElements has no widget options to take from a column that has none", () => {
  assert.equal(omitElements(imported(), new Set(["choices"])).widgetOptions, null);
  assert.equal(omitElements(exported({ widgetOptions: {} }), new Set()).widgetOptions, null);
});

test("the descriptions of the tables are counted in tables, apart from the columns", () => {
  const tables = [{ description: "A" }, { description: null }, { description: "B" }, {}];
  assert.deepEqual(elementCounts([], tables), { ...none, tableDescriptions: 2 });
  assert.deepEqual(elementCounts([exported({ description: "d" })], tables), { ...none, descriptions: 1, tableDescriptions: 2 });
  assert.equal(elementCounts([exported({ description: "d" })]).tableDescriptions, 0);
  assert.deepEqual(ELEMENT_UNITS, { tableDescriptions: "common.tablesCount" });
});

test("omitTable takes the description of a table out when it is omitted, and nothing else", () => {
  const table = { tableId: "T", description: "About T", columns: [] };
  assert.deepEqual(omitTable(table, new Set(["tableDescriptions"])), { tableId: "T", description: null, columns: [] });
  assert.deepEqual(omitTable(table, new Set(["descriptions", "labels"])), table);
  assert.equal(table.description, "About T", "not changed");
});

test("the summary of the choice says all, none, the one or two left out by name, or how many are kept", () => {
  const offered = ["labels", "choices", "options", "formulas"];
  const summary = (...left) => plain(choiceSummary(offered, (element) => !left.includes(element)));
  assert.equal(summary(), "Tous");
  assert.equal(summary("formulas"), "Sans formules");
  assert.equal(summary("labels", "formulas"), "Sans libellés, formules", "in the order of the elements, not of the choices");
  assert.equal(summary("formulas", "labels"), "Sans libellés, formules");
  assert.equal(summary("labels", "choices", "formulas"), "1 sur 4", "from three, the names would be longer than the count");
  assert.equal(summary("labels", "choices", "options", "formulas"), "Aucun");
});

test("a single element on offer is all or none, never a count", () => {
  assert.equal(plain(choiceSummary(["labels"], () => true)), "Tous");
  assert.equal(plain(choiceSummary(["labels"], () => false)), "Aucun");
  assert.equal(plain(choiceSummary([], () => true)), "Tous", "nothing to choose from is not a choice left out");
});
