/**
 * Parses the Python-like "Code View" text that Grist generates for a table
 * (visible via a table's "Code View" menu entry) into a structural
 * description: table id(s) and, for each table, an ordered list of columns
 * with their declared Grist DSL type and raw constructor arguments.
 *
 * This is intentionally NOT a Python interpreter. The input is treated as
 * plain, untrusted text and is only ever matched against a small set of
 * fixed regular expressions, plus the small bracket-depth scanner below
 * (`findMatchingClose`) — itself plain character-by-character text
 * comparison, not a parser or evaluator. Nothing here is ever executed as
 * code. Anything that does not match a known pattern is skipped and
 * reported as a warning instead of causing a failure, so a paste containing
 * unrelated or unsupported code never breaks the import of the parts we
 * understand.
 */

import { t } from "./i18n.js";

const CLASS_RE = /^class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:\s*$/;
const ASSIGN_PREFIX_RE = /^([A-Za-z_]\w*)\s*=\s*grist\.([A-Za-z_]\w*)\s*\(/;
const FORMULA_DECORATOR_PREFIX_RE = /^@grist\.formulaType\(\s*grist\.([A-Za-z_]\w*)\s*\(/;
const DEF_RE = /^def\s+([A-Za-z_]\w*)\s*\(\s*rec\s*,\s*table\s*\)\s*:\s*$/;
const USER_TABLE_DECORATOR = "@grist.UserTable";

const RESERVED_COLUMN_IDS = new Set(["id", "manualSort"]);
const MAX_SNIPPET_LENGTH = 80;

/**
 * Finds the index of the closing bracket that matches the opening bracket
 * at `text[openIndex]` (one of `(`, `[`, `{`), by counting bracket depth
 * while skipping over the contents of single- or double-quoted string
 * literals (so a literal `)`/`]`/`}` inside a quoted value — e.g. a choice
 * named `'Oui (confirmé)'` — never ends the scan early). A backslash inside
 * a quoted string escapes the next character, matching Python's own quoting
 * rules closely enough for this purpose. Returns -1 if the input ends
 * before a matching close is found (e.g. a truncated paste). Pure text
 * scanning: no evaluation of any kind.
 */
export function findMatchingClose(text, openIndex) {
  const OPEN = "([{";
  const CLOSE = ")]}";
  if (OPEN.indexOf(text[openIndex]) === -1) return -1;

  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i++; // skip the escaped character, whatever it is
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (OPEN.indexOf(ch) !== -1) {
      depth++;
    } else if (CLOSE.indexOf(ch) !== -1) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Matches a data-column assignment line (`ColId = grist.Type(...)`),
 * robust to parentheses/brackets inside quoted argument values (see
 * `findMatchingClose`). Returns null if the line isn't a well-formed,
 * fully-closed assignment of this shape.
 */
function matchAssign(trimmed) {
  const prefix = trimmed.match(ASSIGN_PREFIX_RE);
  if (!prefix) return null;
  const openIndex = prefix[0].length - 1;
  const closeIndex = findMatchingClose(trimmed, openIndex);
  if (closeIndex === -1) return null;
  if (trimmed.slice(closeIndex + 1).trim() !== "") return null;
  return { id: prefix[1], dslType: prefix[2], argsRaw: trimmed.slice(openIndex + 1, closeIndex) };
}

/**
 * Matches a `@grist.formulaType(grist.Type(...))` decorator line, same
 * robustness as `matchAssign`. Returns null if not a well-formed, fully-closed
 * decorator of this shape (both the inner and outer parentheses must close).
 */
function matchFormulaDecorator(trimmed) {
  const prefix = trimmed.match(FORMULA_DECORATOR_PREFIX_RE);
  if (!prefix) return null;
  const openIndex = prefix[0].length - 1;
  const closeIndex = findMatchingClose(trimmed, openIndex);
  if (closeIndex === -1) return null;
  const after = trimmed.slice(closeIndex + 1);
  if (!/^\s*\)\s*$/.test(after)) return null;
  return { dslType: prefix[1], argsRaw: trimmed.slice(openIndex + 1, closeIndex) };
}

/**
 * @param {string} sourceText Raw text pasted by the user.
 * @returns {{tables: Array<{tableId: string, line: number, columns: Array}>, warnings: string[]}}
 */
export function parseGristSchema(sourceText) {
  const lines = String(sourceText).replace(/\r\n?/g, "\n").split("\n");
  const tables = [];
  const warnings = [];

  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() !== USER_TABLE_DECORATOR) {
      i++;
      continue;
    }

    const decoratorLineNo = i + 1;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j++;

    const classMatch = j < lines.length ? lines[j].match(CLASS_RE) : null;
    if (!classMatch) {
      warnings.push(t("warn.decoratorNoClass", { line: decoratorLineNo }));
      i++;
      continue;
    }

    const tableId = classMatch[1];
    const { columns, warnings: bodyWarnings, nextIndex } = parseTableBody(lines, j + 1);
    warnings.push(...prefixWarnings(bodyWarnings, tableId));
    tables.push({ tableId, line: i + 1, columns });
    i = nextIndex;
  }

  if (tables.length === 0) {
    warnings.push(t("warn.noTableFound"));
  }

  return { tables, warnings };
}

function prefixWarnings(list, tableId) {
  return list.map((message) => t("warn.tablePrefix", { tableId, message }));
}

function indentOf(line) {
  return line.match(/^[ \t]*/)[0].length;
}

function truncate(text) {
  return text.length > MAX_SNIPPET_LENGTH ? `${text.slice(0, MAX_SNIPPET_LENGTH)}…` : text;
}

/**
 * Parses the indented body of a single `class ...:` block starting at
 * `startIndex`, stopping as soon as a line dedents below the body's own
 * indentation level (or the input ends).
 */
function parseTableBody(lines, startIndex) {
  const warnings = [];
  const columns = [];
  const seenIds = new Set();

  let i = startIndex;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || indentOf(lines[i]) === 0) {
    return { columns, warnings, nextIndex: i };
  }

  const bodyIndent = indentOf(lines[i]);
  let pendingType = null;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    const indent = indentOf(raw);
    if (indent < bodyIndent) break;
    if (indent > bodyIndent) {
      // Part of a previous `def`'s body (e.g. a `return` statement): not a
      // column declaration, skip without interpreting it.
      i++;
      continue;
    }

    let assign, decorator, defMatch;
    if ((assign = matchAssign(trimmed))) {
      if (pendingType) {
        warnings.push(t("warn.formulaTypeNoFunction", { line: i }));
        pendingType = null;
      }
      addColumn(columns, seenIds, warnings, i + 1, assign.id, assign.dslType, assign.argsRaw);
    } else if ((decorator = matchFormulaDecorator(trimmed))) {
      if (pendingType) {
        warnings.push(t("warn.formulaTypeDuplicate", { line: i + 1 }));
      }
      pendingType = { dslType: decorator.dslType, argsRaw: decorator.argsRaw };
    } else if ((defMatch = trimmed.match(DEF_RE))) {
      const dslType = pendingType ? pendingType.dslType : "Any";
      const argsRaw = pendingType ? pendingType.argsRaw : "";
      addColumn(columns, seenIds, warnings, i + 1, defMatch[1], dslType, argsRaw);
      pendingType = null;
    } else if (trimmed.startsWith("#")) {
      // Comment: ignored silently, this is expected, unremarkable input.
    } else if (trimmed.startsWith("@")) {
      warnings.push(t("warn.unknownDecorator", { line: i + 1, snippet: truncate(trimmed) }));
    } else {
      warnings.push(t("warn.unrecognizedContent", { line: i + 1, snippet: truncate(trimmed) }));
    }

    i++;
  }

  return { columns, warnings, nextIndex: i };
}

function addColumn(columns, seenIds, warnings, lineNo, id, dslType, argsRaw) {
  if (RESERVED_COLUMN_IDS.has(id)) {
    warnings.push(t("warn.reservedColumnId", { line: lineNo, id }));
    return;
  }
  if (seenIds.has(id)) {
    warnings.push(t("warn.duplicateColumnId", { line: lineNo, id }));
  }
  seenIds.add(id);
  columns.push({ id, dslType, argsRaw: argsRaw.trim(), line: lineNo });
}
