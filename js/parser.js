/**
 * Reads the Python text of a table's "Code View" without running it: fixed
 * patterns and a bracket scanner only; whatever is not understood becomes a
 * warning, `{ key, params, table }`, rendered by the interface.
 */

import { findMatchingClose, indentOf, parseString, stringLines } from "./pyText.js";
import { RESERVED_COLUMN_IDS } from "./gristTypes.js";

const CLASS_RE = /^class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\)\s*)?:\s*$/; // the spaces after the bases are in the group: two `\s*` side by side would try each split of a long run
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

const isCode = (line) => line.trim() !== "" && !line.trim().startsWith("#");

/**
 * The body of the function written at `parentIndent` whose header precedes line `from`: its code without the
 * common indentation, and the index of the line after it. The lines of a multi-line string (`inString`) belong
 * to it whatever their indentation. Grist before 1.7.20 indents them with the code, later ones write them as the
 * formula has them: so a line less indented than the code means they are left as they are, else they are dedented.
 */
function readBlock(lines, inString, from, parentIndent) {
  let end = from;
  for (let i = from; i < lines.length; i++) {
    if (inString[i]) end = i + 1;
    else if (lines[i].trim() === "") continue;
    else if (indentOf(lines[i]) > parentIndent) end = i + 1;
    else if (isCode(lines[i])) break;
  }
  const layout = [];
  const strings = [];
  for (let i = from; i < end; i++) {
    if (!inString[i]) {
      if (isCode(lines[i])) layout.push(indentOf(lines[i]));
    } else if (lines[i].trim() !== "") {
      strings.push(indentOf(lines[i]));
    }
  }
  if (layout.length === 0) return { code: "", end };
  const common = layout.reduce((least, indent) => Math.min(least, indent));
  const asWritten = strings.some((indent) => indent < common);
  const code = lines
    .slice(from, end)
    .map((line, k) => (asWritten && inString[from + k] ? line : line.slice(Math.min(common, indentOf(line)))))
    .join("\n")
    .trim();
  return { code, end };
}
const truncate = (text) => (text.length > MAX_SNIPPET_LENGTH ? `${text.slice(0, MAX_SNIPPET_LENGTH)}…` : text);

/**
 * @param {string} sourceText what the user pasted
 * @returns {{tables: {tableId: string, description: ?string, columns: {id: string, dslType: string, argsRaw: string, kind: "data"|"formula"|"trigger", code: string}[]}[], warnings: object[]}}
 *   `description`: the table's, written as the string that opens its class (its docstring); `kind`: a data
 *   column, a formula column, or a data column with a trigger formula; `code`: that formula's function body,
 *   as written (empty for a data column).
 */
export function parseGristSchema(sourceText) {
  const lines = String(sourceText).replace(/\r\n?/g, "\n").split("\n");
  const inString = stringLines(lines);
  const tables = [];
  const warnings = [];

  for (let i = 0; i < lines.length; i++) {
    if (inString[i] || lines[i].trim() !== "@grist.UserTable") continue;
    let header = i + 1;
    while (header < lines.length && lines[header].trim() === "") header++;
    const match = lines[header]?.match(CLASS_RE);
    if (!match) {
      warnings.push({ key: "warn.decoratorNoClass", params: { line: i + 1 } });
      continue;
    }
    const body = parseTableBody(lines, inString, header + 1, match[1]);
    tables.push({ tableId: match[1], description: body.description, columns: body.columns });
    for (const warning of body.warnings) warnings.push(warning); // not push(...): a text of hundreds of thousands of lines would overflow the call
    i = body.end - 1;
  }

  if (tables.length === 0) warnings.push({ key: "warn.noTableFound" });
  return { tables, warnings };
}

/** What a class body gives as its statements are read one after the other; `source` is { lines, inString, bodyIndent }. */
const newBody = (table, source) => ({ table, source, description: null, columns: [], warnings: [], triggers: new Map(), seen: new Set(), pendingType: null });

const warn = (body, key, params) => body.warnings.push({ key, params, table: body.table });

/** Adds `column` (`{ id, dslType, argsRaw, kind, code }`) read at `line`, unless its id is reserved or already taken. */
function addColumn(body, column, line) {
  const { id } = column;
  if (RESERVED_COLUMN_IDS.has(id)) warn(body, "warn.reservedColumnId", { line, colId: id });
  else if (body.seen.has(id.toLowerCase())) warn(body, "warn.duplicateColumnId", { line, colId: id });
  else {
    body.seen.add(id.toLowerCase());
    body.columns.push(column);
  }
}

/*
 * How each kind of statement is read. A statement is what `classify` found with its `text`, its `line` number and
 * its `index` in the lines; its reader gives the index of its last line (that of a function is further down).
 */

/** `@grist.formulaType(...)` types the formula column that follows. */
function readFormulaType(body, statement) {
  if (body.pendingType) warn(body, "warn.formulaTypeDuplicate", { line: body.pendingType.line });
  body.pendingType = statement;
  return statement.index;
}

/** A function: the formula of a column, or the trigger formula of a data column that is read later. */
function readFunction(body, statement) {
  const { lines, inString, bodyIndent } = body.source;
  const block = readBlock(lines, inString, statement.index + 1, bodyIndent);
  if (statement.kind === "trigger") {
    body.triggers.set(statement.id, block.code);
  } else {
    const { dslType = "Any", argsRaw = "" } = body.pendingType ?? {};
    addColumn(body, { id: statement.id, dslType, argsRaw, kind: "formula", code: block.code }, statement.line);
    body.pendingType = null;
  }
  return block.end - 1;
}

function readColumn(body, statement) {
  if (body.pendingType) warn(body, "warn.formulaTypeNoFunction", { line: body.pendingType.line });
  body.pendingType = null;
  const { id, dslType, argsRaw } = statement;
  addColumn(body, { id, dslType, argsRaw, kind: "data", code: "" }, statement.line);
  return statement.index;
}

function readUnknown(body, statement) {
  warn(body, statement.kind === "unknownDecorator" ? "warn.unknownDecorator" : "warn.unrecognizedContent", { line: statement.line, snippet: truncate(statement.text) });
  return statement.index;
}

const READERS = {
  formulaType: readFormulaType,
  formula: readFunction,
  trigger: readFunction,
  column: readColumn,
  ignored: (body, statement) => statement.index,
  unknownDecorator: readUnknown,
  unknown: readUnknown,
};

/** The description and the columns of the class body starting at `start`, which ends at the first line indented less than it. */
function parseTableBody(lines, inString, start, table) {
  let i = start;
  while (i < lines.length && lines[i].trim() === "") i++;
  const bodyIndent = i < lines.length ? indentOf(lines[i]) : 0;
  if (bodyIndent === 0) return { description: null, columns: [], warnings: [], end: i };

  const body = newBody(table, { lines, inString, bodyIndent });
  let opening = true; // no statement read yet: a string is the docstring only there
  for (; i < lines.length; i++) {
    const text = lines[i].trim();
    const indent = indentOf(lines[i]);
    if (inString[i] || text === "" || text.startsWith("#") || indent > bodyIndent) continue;
    if (indent < bodyIndent) break;

    const docstring = opening ? parseString(text) : null;
    opening = false;
    if (docstring !== null) {
      body.description = docstring || null;
      continue;
    }
    const statement = { ...classify(text), text, line: i + 1, index: i };
    i = READERS[statement.kind](body, statement);
  }
  return finishBody(body, i);
}

/** What the body gave: a formula type left without its function is said, and a trigger formula joins its data column. */
function finishBody(body, end) {
  if (body.pendingType) warn(body, "warn.formulaTypeNoFunction", { line: body.pendingType.line });
  for (const col of body.columns) if (col.kind === "data" && body.triggers.has(col.id)) Object.assign(col, { kind: "trigger", code: body.triggers.get(col.id) });
  return { description: body.description, columns: body.columns, warnings: body.warnings, end };
}
