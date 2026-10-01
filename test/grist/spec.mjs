/**
 * One column of every kind, with every widget option, awkward texts and ids: what the round trip and the Code View recording
 * are built from. A `formula` makes a formula column (an empty one for ""), a `trigger` a data column with a trigger formula.
 */
export const NASTY = [
  "multi\nline", "it's", 'say "hi"', "back\\slash", "tab\there", "émoji 😀 é", "  padded  ", "(x) [y] {z}", "# hash",
  "a, b", "label = 'x'", "ends with \\", "literal \\n", "windows\r\nline",
];
const col = (id, type, rest = {}) => ({ id, type, ...rest });
const styled = {
  textColor: "#FF0000", fillColor: "#00FF00", fontBold: true, fontItalic: true, fontUnderline: true, fontStrikethrough: true,
  headerTextColor: "#0000FF", headerFillColor: "#FFFF00", headerFontBold: true, headerFontItalic: true,
  headerFontUnderline: true, headerFontStrikethrough: true,
};

export const SPEC = {
  Texts: [
    col("Plain", "Text"),
    col("Aligned", "Text", { widgetOptions: { alignment: "center", wrap: true } }),
    col("Link", "Text", { widgetOptions: { widget: "HyperLink" } }),
    col("Markdown", "Text", { widgetOptions: { widget: "Markdown" } }),
    col("Styled", "Text", { widgetOptions: styled }),
    col("Labelled", "Text", { label: "Un libellé" }),
    col("Tied_label", "Text", { label: "Tied label", tied: true }),
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
  Projects: [col("Name", "Text"), col("Owner", "Ref:People", { reverse: "Projects", label: "Responsable", description: "Qui porte le projet", visibleCol: "Name" })],
  People: [col("Name", "Text"), col("Projects", "RefList:Projects", { visibleCol: "Name" })],
  Grid: [col("Left", "RefList:Grid", { reverse: "Right" }), col("Right", "RefList:Grid"), col("Parent", "Ref:Grid", { reverse: "Kids" }), col("Kids", "RefList:Grid")],
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
    col("FDate", "Date", { formula: "DATE(2020, 1, 31)" }),
    col("FDateTime", "DateTime:Europe/Paris", { formula: "NOW()" }),
    col("FChoice", "Choice", { formula: "'a'", widgetOptions: { choices: ["a", "b"] } }),
    col("FList", "ChoiceList", { formula: "[]" }),
    col("FRef", "Ref:Texts", { formula: "Texts.lookupOne(Plain='x')" }),
    col("FRefList", "RefList:Texts", { formula: "Texts.lookupRecords()" }),
    col("FAny", "Any", { formula: "$Data1", description: "Formula with a description" }),
    col("FMulti", "Text", { formula: "x = $Data1\nx + '!'" }),
    col("FString", "Text", { formula: 'note = """first\n# not a comment\n  indented\n\nlast"""\nnote.strip()' }),
    col("FRec", "Int", { formula: "rec.Data2 + 1" }),
    col("FEmpty", "Numeric", { formula: "" }),
    col("Stamp", "Text", { trigger: "'new'" }),
    col("StampNote", "Text", { trigger: '"""a\nb"""' }),
    col("StampNum", "Int", { trigger: "$Data2 + 1", label: "Numéro" }),
    col("Data3", "Text"),
  ],
  Ids: ["a", "A_b", "x1", "X__Y", "L".repeat(60), "Select", "None_", "rec", "table", "value", "user", "SUM", "lowerUpper", "ALLCAPS", "trailing_"].map((id) => col(id, "Text")),
  T: [col("A", "Text")],
  With_Under: [col("A", "Text")],
  ALLCAPS: [col("A", "Text")],
  ["L".repeat(60)]: [col("A", "Text")],
};

