/**
 * Reads the Python text of a table's "Code View" without running it: fixed
 * patterns and a bracket scanner only; whatever is not understood becomes a
 * warning, `{ key, params, table }`, rendered by the interface.
 */

import { findMatchingClose } from "./pyText.js";
import { RESERVED_COLUMN_IDS } from "./gristTypes.js";

const CLASS_RE = /^class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:\s*$/;
const ASSIGN_RE = /^([A-Za-z_]\w*)\s*=\s*grist\.([A-Za-z_]\w*)\s*\(/;
const FORMULA_TYPE_RE = /^@grist\.formulaType\(\s*grist\.([A-Za-z_]\w*)\s*\(/;
const FORMULA_DEF_RE = /^def\s+([A-Za-z_]\w*)\s*\(\s*rec\s*,\s*table\s*\)\s*:\s*$/;
const TRIGGER_DEF_RE = /^def\s+_default_(\w+)\s*\(\s*rec\s*,\s*table\s*,\s*value\s*,\s*user\s*\)\s*:\s*$/;
const SUMMARY_CLASS_RE = /^class\s+_Summary\s*:\s*$/;
const MAX_SNIPPET_LENGTH = 80;

/** `prefix` followed by a closed call and then only `tail`: the prefix match and the call's arguments, or null. */
function matchCall(text, prefix, tail) {
  const start = text.match(prefix);
  if (!start) return null;
  const open = start[0].length - 1;
  const close = findMatchingClose(text, open);
  if (close === -1 || !tail.test(text.slice(close + 1))) return null;
  return { start, args: text.slice(open + 1, close).trim() };
}

function classify(text) {
  const column = matchCall(text, ASSIGN_RE, /^\s*$/);
  if (column) return { kind: "column", id: column.start[1], dslType: column.start[2], argsRaw: column.args };
  const type = matchCall(text, FORMULA_TYPE_RE, /^\s*\)\s*$/);
  if (type) return { kind: "formulaType", dslType: type.start[1], argsRaw: type.args };
  const formula = text.match(FORMULA_DEF_RE);
  if (formula) return { kind: "formula", id: formula[1] };
  const trigger = text.match(TRIGGER_DEF_RE);
  if (trigger) return { kind: "trigger", id: trigger[1] };
  if (text === "pass" || SUMMARY_CLASS_RE.test(text)) return { kind: "ignored" };
  return { kind: text.startsWith("@") ? "unknownDecorator" : "unknown" };
}

const indentOf = (line) => line.match(/^[ \t]*/)[0].length;
const isCode = (line) => line.trim() !== "" && !line.trim().startsWith("#");

/** The body of the function written at `parentIndent` whose header precedes line `from`: its code without the common indentation, and the index of the line after it. */
function readBlock(lines, from, parentIndent) {
  let end = from;
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (indentOf(lines[i]) > parentIndent) end = i + 1;
    else if (isCode(lines[i])) break;
  }
  const body = lines.slice(from, end);
  if (!body.some(isCode)) return { code: "", end };
  const common = Math.min(...body.filter(isCode).map(indentOf));
  const code = body.map((line) => line.slice(Math.min(common, indentOf(line)))).join("\n").trim();
  return { code, end };
}
const truncate = (text) => (text.length > MAX_SNIPPET_LENGTH ? `${text.slice(0, MAX_SNIPPET_LENGTH)}…` : text);

/**
 * @param {string} sourceText what the user pasted
 * @returns {{tables: {tableId: string, columns: {id: string, dslType: string, argsRaw: string, kind: "data"|"formula"|"trigger", code: string}[]}[], warnings: object[]}}
 *   `kind`: a data column, a formula column, or a data column with a trigger formula; `code`: that
 *   formula's function body, as written (empty for a data column).
 */
export function parseGristSchema(sourceText) {
  const lines = String(sourceText).replace(/\r\n?/g, "\n").split("\n");
  const tables = [];
  const warnings = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== "@grist.UserTable") continue;
    let header = i + 1;
    while (header < lines.length && lines[header].trim() === "") header++;
    const match = lines[header]?.match(CLASS_RE);
    if (!match) {
      warnings.push({ key: "warn.decoratorNoClass", params: { line: i + 1 } });
      continue;
    }
    const body = parseTableBody(lines, header + 1, match[1]);
    tables.push({ tableId: match[1], columns: body.columns });
    warnings.push(...body.warnings);
    i = body.end - 1;
  }

  if (tables.length === 0) warnings.push({ key: "warn.noTableFound" });
  return { tables, warnings };
}

/** The columns of the class body starting at `start`, which ends at the first line indented less than it. */
function parseTableBody(lines, start, table) {
  const columns = [];
  const warnings = [];
  const triggers = new Map();
  const seen = new Set();
  const warn = (key, params) => warnings.push({ key, params, table });
  let pendingType = null;

  let i = start;
  while (i < lines.length && lines[i].trim() === "") i++;
  const bodyIndent = i < lines.length ? indentOf(lines[i]) : 0;
  if (bodyIndent === 0) return { columns, warnings, end: i };

  const addColumn = (id, dslType, argsRaw, kind, code, line) => {
    if (RESERVED_COLUMN_IDS.has(id)) warn("warn.reservedColumnId", { line, id });
    else if (seen.has(id.toLowerCase())) warn("warn.duplicateColumnId", { line, id });
    else {
      seen.add(id.toLowerCase());
      columns.push({ id, dslType, argsRaw, kind, code });
    }
  };

  for (; i < lines.length; i++) {
    const text = lines[i].trim();
    const indent = indentOf(lines[i]);
    if (text === "" || text.startsWith("#") || indent > bodyIndent) continue;
    if (indent < bodyIndent) break;

    const line = i + 1;
    const found = classify(text);
    if (found.kind === "formulaType") {
      if (pendingType) warn("warn.formulaTypeDuplicate", { line: pendingType.line });
      pendingType = { ...found, line };
    } else if (found.kind === "formula" || found.kind === "trigger") {
      const block = readBlock(lines, i + 1, bodyIndent);
      i = block.end - 1;
      if (found.kind === "trigger") {
        triggers.set(found.id, block.code);
      } else {
        addColumn(found.id, pendingType?.dslType ?? "Any", pendingType?.argsRaw ?? "", "formula", block.code, line);
        pendingType = null;
      }
    } else if (found.kind === "column") {
      if (pendingType) warn("warn.formulaTypeNoFunction", { line: pendingType.line });
      pendingType = null;
      addColumn(found.id, found.dslType, found.argsRaw, "data", "", line);
    } else if (found.kind !== "ignored") {
      warn(found.kind === "unknownDecorator" ? "warn.unknownDecorator" : "warn.unrecognizedContent", { line, snippet: truncate(text) });
    }
  }
  if (pendingType) warn("warn.formulaTypeNoFunction", { line: pendingType.line });

  for (const col of columns) if (col.kind === "data" && triggers.has(col.id)) Object.assign(col, { kind: "trigger", code: triggers.get(col.id) });
  return { columns, warnings, end: i };
}
