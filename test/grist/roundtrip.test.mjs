/**
 * Every column type with its widget options, texts and ids, built in a source
 * document the way Grist does, exported, re-imported in another document and
 * compared column by column.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { roundTrip, expectedAfterImport } from "./support.mjs";

const NASTY = [
  "multi\nline", "it's", 'say "hi"', "back\\slash", "tab\there", "émoji 😀 é", "  padded  ", "(x) [y] {z}", "# hash",
  "a, b", "label = 'x'", "ends with \\", "literal \\n", "windows\r\nline",
];
const col = (id, type, rest = {}) => ({ id, type, ...rest });
const styled = {
  textColor: "#FF0000", fillColor: "#00FF00", fontBold: true, fontItalic: true, fontUnderline: true, fontStrikethrough: true,
  headerTextColor: "#0000FF", headerFillColor: "#FFFF00", headerFontBold: true, headerFontItalic: true,
  headerFontUnderline: true, headerFontStrikethrough: true,
};

const SPEC = {
  Texts: [
    col("Plain", "Text"),
    col("Aligned", "Text", { widgetOptions: { alignment: "center", wrap: true } }),
    col("Link", "Text", { widgetOptions: { widget: "HyperLink" } }),
    col("Markdown", "Text", { widgetOptions: { widget: "Markdown" } }),
    col("Styled", "Text", { widgetOptions: styled }),
    col("Labelled", "Text", { label: "Un libellé" }),
    col("Described", "Text", { description: "A description" }),
    col("Form", "Text", { widgetOptions: { question: "Votre nom ?", formRequired: true, formTextLines: "3" } }),
    col("Rules", "Text", { widgetOptions: { rulesOptions: [{ fillColor: "#FF0000" }] } }),
    ...NASTY.map((text, i) => col(`Nasty${i}`, "Text", { label: text, description: text, widgetOptions: { question: text } })),
  ],
  Numbers: [
    col("Plain", "Numeric"),
    col("Eur", "Numeric", { widgetOptions: { numMode: "currency", currency: "EUR", decimals: 2, maxDecimals: 6, numSign: "parens" } }),
    col("Pct", "Numeric", { widgetOptions: { numMode: "percent", decimals: 1 } }),
    col("Sci", "Numeric", { widgetOptions: { numMode: "scientific" } }),
    col("Dec", "Numeric", { widgetOptions: { numMode: "decimal", decimals: 0, maxDecimals: 10 } }),
    col("Spin", "Numeric", { widgetOptions: { widget: "Spinner", step: 0.5, minValue: 0, maxValue: 10 } }),
    col("Whole", "Int"),
    col("WholeUsd", "Int", { widgetOptions: { numMode: "currency", currency: "USD" } }),
    col("WholeSpin", "Int", { widgetOptions: { widget: "Spinner" } }),
    col("BackToLinks", "Ref:Links"),
  ],
  Dates: [
    col("Day", "Date"),
    col("French", "Date", { widgetOptions: { dateFormat: "DD/MM/YYYY", isCustomDateFormat: true } }),
    col("Iso", "Date", { widgetOptions: { dateFormat: "YYYY-MM-DD", isCustomDateFormat: false } }),
    col("Paris", "DateTime:Europe/Paris"),
    col("Utc", "DateTime:UTC", {
      widgetOptions: { dateFormat: "ddd D MMM YYYY", timeFormat: "HH:mm:ss", isCustomDateFormat: true, isCustomTimeFormat: true },
    }),
    col("NewYork", "DateTime:America/New_York"),
    col("Kolkata", "DateTime:Asia/Kolkata"),
    col("BuenosAires", "DateTime:America/Argentina/Buenos_Aires"),
  ],
  Choices: [
    col("Pick", "Choice", { widgetOptions: { choices: ["Oui", "Non", "Peut-être"] } }),
    col("NoChoices", "Choice"),
    col("Styled", "Choice", {
      widgetOptions: {
        choices: ["a", "b"],
        choiceOptions: { a: { fillColor: "#FF0000", textColor: "#FFFFFF", fontBold: true, fontItalic: true, fontUnderline: true, fontStrikethrough: true }, b: { textColor: "#00FF00" } },
      },
    }),
    col("Nasty", "Choice", {
      widgetOptions: { choices: NASTY, choiceOptions: { [NASTY[0]]: { fillColor: "#112233" }, [NASTY[1]]: { textColor: "#445566" }, [NASTY[2]]: { fontBold: true } } },
    }),
    col("Many", "ChoiceList", { widgetOptions: { choices: Array.from({ length: 200 }, (_, i) => `Choice ${i}`) } }),
    col("Tags", "ChoiceList", { widgetOptions: { choices: ["x", "y"], choiceOptions: { x: { fillColor: "#ABCDEF" } } } }),
    col("Conditional", "Choice", { widgetOptions: { choices: ["a"], dropdownCondition: { text: "choice not in $Plain", parsed: "[]" } } }),
    col("Aligned", "Choice", { widgetOptions: { choices: ["a"], alignment: "right", wrap: true } }),
    col("Form", "ChoiceList", { widgetOptions: { choices: ["a"], formSelectOptions: "checkbox", formOptionsAlignment: "horizontal", formOptionsSortOrder: "ascending" } }),
  ],
  Flags: [
    col("Plain", "Bool"),
    col("Box", "Bool", { widgetOptions: { widget: "CheckBox" } }),
    col("Switch", "Bool", { widgetOptions: { widget: "Switch", formToggleFormat: "switch" } }),
  ],
  Links: [
    col("Text", "Text"),
    col("ToTexts", "Ref:Texts"),
    col("Shown", "Ref:Texts", { visibleCol: "Plain" }),
    col("Many", "RefList:Texts", { visibleCol: "Described", description: "List of rows" }),
    col("Self", "Ref:Links"),
    col("SelfList", "RefList:Links", { widgetOptions: { alignment: "right" } }),
    col("ToNumbers", "Ref:Numbers", { visibleCol: "Eur" }),
    col("Styled", "Ref:Texts", { widgetOptions: { fillColor: "#ABCDEF" } }),
  ],
  Misc: [
    col("Files", "Attachments"),
    col("FilesTall", "Attachments", { widgetOptions: { height: 120 } }),
    col("Anything", "Any"),
  ],
  Formulas: [
    col("Data1", "Text"),
    col("FText", "Text", { formula: "$Data1" }),
    col("Data2", "Int"),
    col("FNum", "Numeric", { formula: "$Data2 * 2", widgetOptions: { numMode: "currency" } }),
    col("FBool", "Bool", { formula: "True" }),
    col("FDate", "Date", { formula: "None" }),
    col("FDateTime", "DateTime:Europe/Paris", { formula: "NOW()" }),
    col("FChoice", "Choice", { formula: "'a'", widgetOptions: { choices: ["a", "b"] } }),
    col("FList", "ChoiceList", { formula: "[]" }),
    col("FRef", "Ref:Texts", { formula: "Texts.lookupOne(Plain='x')" }),
    col("FRefList", "RefList:Texts", { formula: "Texts.lookupRecords()" }),
    col("FAny", "Any", { formula: "None", description: "Formula with a description" }),
    col("Data3", "Text"),
  ],
  Ids: ["a", "A_b", "x1", "X__Y", "L".repeat(60), "Select", "None_", "rec", "table", "value", "user", "SUM", "lowerUpper", "ALLCAPS", "trailing_"].map((id) => col(id, "Text")),
  T: [col("A", "Text")],
  With_Under: [col("A", "Text")],
  ALLCAPS: [col("A", "Text")],
  ["L".repeat(60)]: [col("A", "Text")],
};

const { text, note, before, after } = await roundTrip(SPEC);

test("the whole export is imported without a warning or a note", () => {
  assert.equal(note, "");
  assert.ok(text.length > 0);
});

for (const tableId of Object.keys(SPEC)) {
  const expected = expectedAfterImport(before[tableId]);

  test(`${tableId}: same columns, same order`, () => {
    assert.deepEqual(after[tableId].map((col) => col.id), expected.map((col) => col.id));
  });

  for (const [index, wanted] of expected.entries()) {
    test(`${tableId}.${wanted.id.slice(0, 30)}`, () => {
      assert.deepEqual(after[tableId][index], wanted);
    });
  }
}
