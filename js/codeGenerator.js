/**
 * Generates Python "Code View" text from a table schema, mirroring Grist's
 * own generator (`sandbox/grist/gencode.py`, function `make_module` /
 * `_make_table_model`) closely enough to produce the same header, the same
 * blank-line spacing between fields, and the same `grist.Xxx(...)` type
 * expressions (via gristTypes.js's `buildTypeExpression`).
 *
 * One deliberate difference: for a formula column whose real formula is
 * non-blank, Grist's generator translates `$col` references to `rec.col`
 * using a full Python-aware parser. Reproducing that exactly would need a
 * Python parser, which this zero-dependency widget does not carry. Instead,
 * the raw stored formula text (still using Grist's `$col` syntax) is
 * reproduced as-is — correct information, just not translated to the same
 * dialect real Code View shows. A blank formula still becomes exactly
 * `return <type default>`, as Grist itself generates for that case.
 */

import { buildTypeExpression, defaultLiteralForType } from "./gristTypes.js";

const HEADER =
  "import grist\n" +
  "from functions import *       # global uppercase functions\n" +
  "import datetime, math, re     # modules commonly needed in formulas\n";

const INDENT = "  ";
const STATEMENT_START_RE = /^(return|if|for|while|with|try|raise|assert|import|def|class|pass|#)\b/;

/**
 * @param {Array<{tableId: string, columns: Array<{colId: string, type: string, isFormula: boolean, formula?: string}>}>} tables
 * @returns {string}
 */
export function generateCode(tables) {
  let text = HEADER;
  for (const table of tables) {
    text += "\n\n" + tableBlockText(table);
  }
  return text;
}

function tableBlockText(table) {
  let text = `@grist.UserTable\nclass ${table.tableId}:\n`;
  if (table.columns.length === 0) {
    return text + `${INDENT}pass\n`;
  }
  for (const col of table.columns) {
    text += fieldText(col);
  }
  return text;
}

function fieldText(col) {
  const typeExpr = buildTypeExpression(col.type);

  if (!col.isFormula) {
    return `${INDENT}${col.colId} = ${typeExpr}\n`;
  }

  const decorator = col.type !== "Any" ? `${INDENT}@grist.formulaType(${typeExpr})\n` : "";
  const decl = `${INDENT}def ${col.colId}(rec, table):\n`;
  const body = formulaBodyText(col.formula, defaultLiteralForType(col.type), INDENT + INDENT);
  return `\n${decorator}${decl}${body}\n`;
}

function formulaBodyText(formula, defaultLiteral, bodyIndent) {
  const trimmed = String(formula || "").trim();
  if (!trimmed) {
    return bodyIndent + "return " + defaultLiteral;
  }

  const lines = dedent(String(formula).replace(/\r\n?/g, "\n").split("\n"));
  if (lines.length === 1) {
    const line = STATEMENT_START_RE.test(trimmed) ? trimmed : `return ${trimmed}`;
    return bodyIndent + line;
  }
  return lines.map((line) => (line ? bodyIndent + line : "")).join("\n");
}

function dedent(lines) {
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    const leading = line.match(/^[ \t]*/)[0].length;
    minIndent = Math.min(minIndent, leading);
  }
  if (!Number.isFinite(minIndent) || minIndent === 0) return lines;
  return lines.map((line) => (line.trim() === "" ? line : line.slice(minIndent)));
}
