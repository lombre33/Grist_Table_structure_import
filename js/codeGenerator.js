/**
 * Code View text from a table schema, in the format of Grist's gencode.py. Two differences: a
 * formula keeps Grist's `$col` syntax (translating it to `rec.col` takes a Python parser), and a
 * column's constructor may carry this widget's own arguments (see buildKwargs).
 */

import { buildTypeExpression, defaultLiteralForType } from "./gristTypes.js";
import { quotePython } from "./pyText.js";
import { isPlainObject, sanitizeWidgetOptions } from "./widgetOptions.js";

const HEADER =
  "import grist\n" +
  "from functions import *       # global uppercase functions\n" +
  "import datetime, math, re     # modules commonly needed in formulas\n";

const INDENT = "  ";
const STATEMENT_START_RE = /^(return|if|for|while|with|try|raise|assert|import|def|class|pass)\b/;

/** @param {{tableId: string, columns: object[]}[]} tables as built by buildExportSchema */
export function generateCode(tables) {
  return HEADER + tables.map((table) => `\n\n${tableText(table)}`).join("");
}

function tableText({ tableId, columns }) {
  const body = columns.length > 0 ? columns.map(fieldText).join("") : `${INDENT}pass\n`;
  return `@grist.UserTable\nclass ${tableId}:\n${body}`;
}

function fieldText(col) {
  const kwargs = buildKwargs(col);
  const typeExpr = buildTypeExpression(col.type, kwargs);
  if (!col.isFormula) return `${INDENT}${col.colId} = ${typeExpr}\n`;

  const typed = col.type !== "Any" || Object.keys(kwargs).length > 0;
  const decorator = typed ? `${INDENT}@grist.formulaType(${typeExpr})\n` : "";
  return `\n${decorator}${INDENT}def ${col.colId}(rec, table):\n${formulaBody(col.formula, defaultLiteralForType(col.type))}\n`;
}

/** What a column has beyond its type, as Python source: only what there is to say. */
function buildKwargs(col) {
  const options = isPlainObject(col.widgetOptions) ? col.widgetOptions : null;
  const otherOptions = sanitizeWidgetOptions(options);
  return {
    ...(Array.isArray(options?.choices) && options.choices.length > 0 && { choices: `[${options.choices.map(quotePython).join(", ")}]` }),
    ...(otherOptions && { widget_options: quotePython(JSON.stringify(otherOptions)) }),
    ...(col.label && col.label !== col.colId && { label: quotePython(col.label) }),
    ...(col.description && { description: quotePython(col.description) }),
    ...(col.visibleColId && { visible_col: quotePython(col.visibleColId) }),
  };
}

function formulaBody(formula, blankLiteral) {
  const text = String(formula ?? "");
  const body = INDENT + INDENT;
  if (!text.trim()) return `${body}return ${blankLiteral}`;

  const lines = dedent(text.replace(/\r\n?/g, "\n").split("\n"));
  if (lines.length > 1) return lines.map((line) => (line ? body + line : "")).join("\n");
  return body + (STATEMENT_START_RE.test(text.trim()) ? text.trim() : `return ${text.trim()}`);
}

function dedent(lines) {
  const indents = lines.filter((line) => line.trim() !== "").map((line) => line.match(/^[ \t]*/)[0].length);
  const common = Math.min(...indents);
  return common > 0 && Number.isFinite(common) ? lines.map((line) => (line.trim() === "" ? line : line.slice(common))) : lines;
}
