/**
 * Parses the Python-like "Code View" text that Grist generates for a table
 * (visible via a table's "Code View" menu entry) into a structural
 * description: table id(s) and, for each table, an ordered list of columns
 * with their declared Grist DSL type and raw constructor arguments.
 *
 * This is intentionally NOT a Python interpreter. The input is treated as
 * plain, untrusted text and is only ever matched against a small set of
 * fixed regular expressions. Nothing here is ever executed as code.
 * Anything that does not match a known pattern is skipped and reported as
 * a warning instead of causing a failure, so a paste containing unrelated
 * or unsupported code never breaks the import of the parts we understand.
 */

const CLASS_RE = /^class\s+([A-Za-z_]\w*)\s*(?:\([^)]*\))?\s*:\s*$/;
const ASSIGN_RE = /^([A-Za-z_]\w*)\s*=\s*grist\.([A-Za-z_]\w*)\s*\(([^)]*)\)\s*$/;
const FORMULA_DECORATOR_RE = /^@grist\.formulaType\(\s*grist\.([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\)\s*$/;
const DEF_RE = /^def\s+([A-Za-z_]\w*)\s*\(\s*rec\s*,\s*table\s*\)\s*:\s*$/;
const USER_TABLE_DECORATOR = "@grist.UserTable";

const RESERVED_COLUMN_IDS = new Set(["id", "manualSort"]);
const MAX_SNIPPET_LENGTH = 80;

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
      warnings.push(
        `Ligne ${decoratorLineNo} : "${USER_TABLE_DECORATOR}" n'est pas suivi d'une classe valide ("class NomTable:"), ignoré.`
      );
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
    warnings.push(
      `Aucune table trouvée : le texte doit contenir un bloc "${USER_TABLE_DECORATOR}" suivi de "class NomTable:".`
    );
  }

  return { tables, warnings };
}

function prefixWarnings(list, tableId) {
  return list.map((message) => `Table « ${tableId} » — ${message}`);
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

    let match;
    if ((match = trimmed.match(ASSIGN_RE))) {
      if (pendingType) {
        warnings.push(
          `Ligne ${i} : décorateur formulaType non suivi d'une fonction, ignoré.`
        );
        pendingType = null;
      }
      addColumn(columns, seenIds, warnings, i + 1, match[1], match[2], match[3]);
    } else if ((match = trimmed.match(FORMULA_DECORATOR_RE))) {
      if (pendingType) {
        warnings.push(`Ligne ${i + 1} : décorateur formulaType en double, le précédent est ignoré.`);
      }
      pendingType = { dslType: match[1], argsRaw: match[2] };
    } else if ((match = trimmed.match(DEF_RE))) {
      const dslType = pendingType ? pendingType.dslType : "Any";
      const argsRaw = pendingType ? pendingType.argsRaw : "";
      addColumn(columns, seenIds, warnings, i + 1, match[1], dslType, argsRaw);
      pendingType = null;
    } else if (trimmed.startsWith("#")) {
      // Comment: ignored silently, this is expected, unremarkable input.
    } else if (trimmed.startsWith("@")) {
      warnings.push(`Ligne ${i + 1} : décorateur non reconnu ignoré (${truncate(trimmed)}).`);
    } else {
      warnings.push(`Ligne ${i + 1} : contenu non reconnu ignoré (${truncate(trimmed)}).`);
    }

    i++;
  }

  return { columns, warnings, nextIndex: i };
}

function addColumn(columns, seenIds, warnings, lineNo, id, dslType, argsRaw) {
  if (RESERVED_COLUMN_IDS.has(id)) {
    warnings.push(
      `Ligne ${lineNo} : colonne « ${id} » ignorée (identifiant réservé, déjà géré par Grist).`
    );
    return;
  }
  if (seenIds.has(id)) {
    warnings.push(
      `Ligne ${lineNo} : colonne « ${id} » en double, Grist ajoutera un suffixe automatiquement.`
    );
  }
  seenIds.add(id);
  columns.push({ id, dslType, argsRaw: argsRaw.trim(), line: lineNo });
}
