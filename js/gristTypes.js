/**
 * Maps the small set of Grist Python DSL type constructors (as they appear
 * in a table's "Code View": grist.Text(), grist.Choice(), grist.Reference(),
 * ...) to the column `type` strings and `widgetOptions` expected by the
 * Grist "AddTable" / "AddColumn" user actions.
 *
 * Argument parsing below only ever extracts a leading quoted string literal,
 * a `choices=[...]` list, or one of a few other quoted `name='...'` keyword
 * arguments (`label`, `description`, `widget_options`, `visible_col` — see
 * "Extended kwargs" below) via fixed regular expressions and the
 * bracket-depth scanner from parser.js. It never evaluates the constructor
 * arguments as code, and a `widget_options='<JSON>'` value is only ever
 * passed to `JSON.parse` (never `eval`/`Function`), inside a try/catch so a
 * malformed value is silently ignored rather than breaking the import.
 *
 * ## Extended kwargs (this widget's own extension, not real Grist Code View)
 *
 * Real Grist "Code View" only ever writes the type's own leading positional
 * argument (table name, timezone) and, for Choice/ChoiceList, occasionally
 * `choices=[...]`. To let Export capture more of a column's metadata and
 * have Import restore it, this widget additionally recognizes, on the same
 * single line, as extra keyword arguments (all optional, all single-quoted
 * strings — see js/codeGenerator.js for how they are generated):
 *
 * - `choices=[...]`: already partly supported by real Code View, extended
 *   here to also survive values containing parentheses/brackets.
 * - `widget_options='<JSON>'`: the column's remaining `widgetOptions`
 *   (everything except `choices`, already represented separately), as a
 *   JSON object serialized inside a single-quoted Python string (so the
 *   JSON's own double quotes need no escaping). A fixed set of keys is
 *   dropped or narrowed by `sanitizeWidgetOptions` below — see its comment
 *   for why each one is excluded or restricted — but everything else
 *   (colors, fonts, per-type formatting options, the `question` field used
 *   by Grist forms, etc.) is preserved as an opaque pass-through value.
 * - `label='...'`: only emitted by Export when different from the column
 *   id (Grist defaults the label to the id).
 * - `description='...'`: the column's description, if any.
 * - `visible_col='OtherColId'`: for Reference/ReferenceList columns, the id
 *   (not a raw internal row id, which would be meaningless in a different
 *   document) of the column in the *target* table used as the "visible
 *   column" for display. See importTab.js for how this is resolved back to
 *   a real row id and applied (`ModifyColumn` + `SetDisplayFormula`) — this
 *   only ever works when that target column already exists in the
 *   destination document, which is required anyway for the reference
 *   itself to import as a Reference rather than as `Any` (see README.md).
 *
 * A real Code View paste (without any of these kwargs) parses exactly as
 * before: every kwarg here is optional and additive.
 */

import { findMatchingClose } from "./parser.js";

const FIRST_STRING_ARG_RE = /^\s*['"]([^'"]*)['"]/;
const QUOTED_ITEM_RE = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;
const DEFAULT_TIMEZONE = "UTC";

const TABLE_ID_RE = /^[A-Za-z_]\w*$/;

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

// widgetOptions keys that are never carried through export -> widget_options
// -> import, and why. Applied by sanitizeWidgetOptions() on both sides
// (export filters the real widgetOptions before writing it out; import
// applies the same filter defensively to whatever JSON.parse produced, in
// case of a hand-edited or foreign paste) so there is exactly one place
// that decides what is safe to carry across documents.
//
// - "rulesOptions": conditional-formatting per-rule styles. Meaningless on
//   its own: Grist only interprets it positionally alongside the column's
//   `rules` field, a list of references to hidden helper formula columns
//   that this widget does not export or recreate (see README/SECURITY).
//   Carrying rulesOptions across without `rules` would silently produce
//   inert, confusing JSON. Grist's own intra-document copy logic excludes
//   it for the same reason.
// - "dropdownCondition": narrowed to its `.text` (the human-readable
//   formula) only; `.parsed` is a compiled AST produced by Grist's formula
//   engine from the *source* document's column names and is not something
//   this widget reconstructs — Grist recomputes it from `.text` on save.
const EXCLUDED_WIDGET_OPTION_KEYS = new Set(["rulesOptions"]);

const CHOICE_STYLE_COLOR_KEYS = new Set(["textColor", "fillColor"]);
const CHOICE_STYLE_BOOL_KEYS = new Set(["fontBold", "fontItalic", "fontUnderline", "fontStrikethrough"]);

const ROOT_COLOR_KEYS = new Set(["textColor", "fillColor", "headerTextColor", "headerFillColor"]);
const ROOT_BOOL_KEYS = new Set([
  "fontBold",
  "fontItalic",
  "fontUnderline",
  "fontStrikethrough",
  "headerFontBold",
  "headerFontItalic",
  "headerFontUnderline",
  "headerFontStrikethrough",
  "wrap",
  "isCustomDateFormat",
  "isCustomTimeFormat",
]);

/**
 * Validates one per-choice style object (`choiceOptions[choiceText]`)
 * against the exact key set Grist itself accepts (see js/gristTypes.js
 * module comment / README for the source research): any other key, or a
 * value of the wrong type (a color not matching `/^#[0-9A-Fa-f]{6}$/`, a
 * flag that isn't a boolean), is dropped rather than written through.
 */
function sanitizeChoiceStyle(style) {
  if (!style || typeof style !== "object") return undefined;
  const out = {};
  for (const [key, value] of Object.entries(style)) {
    if (CHOICE_STYLE_COLOR_KEYS.has(key)) {
      if (typeof value === "string" && HEX_COLOR_RE.test(value)) out[key] = value;
    } else if (CHOICE_STYLE_BOOL_KEYS.has(key)) {
      if (typeof value === "boolean") out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeChoiceOptions(choiceOptions) {
  if (!choiceOptions || typeof choiceOptions !== "object") return null;
  const out = {};
  for (const [choiceText, style] of Object.entries(choiceOptions)) {
    const sanitized = sanitizeChoiceStyle(style);
    if (sanitized) out[choiceText] = sanitized;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Filters a raw `widgetOptions` object (as parsed from either the real
 * document's `_grist_Tables_column.widgetOptions` JSON at export, or a
 * `widget_options='<JSON>'` kwarg at import) down to a safe, faithful
 * subset: known dangerous/meaningless keys removed (see
 * EXCLUDED_WIDGET_OPTION_KEYS above), known color/boolean sub-keys
 * validated, `choices` always excluded (it is represented separately, by
 * its own `choices=[...]` kwarg), and every other key passed through
 * untouched (generic per-type options such as `numMode`, `dateFormat`,
 * `alignment`, `widget`, `question`, the `form*` keys, ... — this widget
 * does not need to know every current or future Grist widgetOptions key by
 * name to preserve it faithfully).
 *
 * Returns null if nothing is left after filtering (including for a
 * non-object input), so callers can omit an empty `widget_options=`/
 * `widgetOptions` entirely rather than writing `'{}'`.
 */
export function sanitizeWidgetOptions(options) {
  if (!options || typeof options !== "object") return null;
  const out = {};
  for (const [key, rawValue] of Object.entries(options)) {
    if (key === "choices") continue;
    if (EXCLUDED_WIDGET_OPTION_KEYS.has(key)) continue;
    if (rawValue === undefined) continue;

    let value = rawValue;
    if (key === "choiceOptions") {
      value = sanitizeChoiceOptions(value);
      if (!value) continue;
    } else if (key === "dropdownCondition") {
      if (!value || typeof value !== "object" || typeof value.text !== "string" || !value.text) continue;
      value = { text: value.text };
    } else if (ROOT_COLOR_KEYS.has(key)) {
      if (typeof value !== "string" || !HEX_COLOR_RE.test(value)) continue;
    } else if (ROOT_BOOL_KEYS.has(key)) {
      if (typeof value !== "boolean") continue;
    }
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function unescapePythonQuoted(text) {
  return text.replace(/\\(.)/g, "$1");
}

/**
 * Matches `name='...'` or `name="..."` — both quote styles, like
 * QUOTED_ITEM_RE below for `choices=[...]` items, so a hand-edited or
 * foreign paste using double quotes for these kwargs isn't silently
 * ignored just because this widget's own Export always writes single
 * quotes (see js/codeGenerator.js's pyStringLiteral).
 */
function extractQuotedKwarg(argsRaw, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:'((?:\\\\.|[^'\\\\])*)'|"((?:\\\\.|[^"\\\\])*)")`);
  const match = argsRaw.match(re);
  if (!match) return null;
  return unescapePythonQuoted(match[1] !== undefined ? match[1] : match[2]);
}

function extractChoicesKwarg(argsRaw) {
  const start = argsRaw.search(/choices\s*=\s*\[/);
  if (start === -1) return null;
  const openIndex = argsRaw.indexOf("[", start);
  const closeIndex = findMatchingClose(argsRaw, openIndex);
  if (closeIndex === -1) return null;

  const inner = argsRaw.slice(openIndex + 1, closeIndex);
  const choices = [];
  let item;
  QUOTED_ITEM_RE.lastIndex = 0;
  while ((item = QUOTED_ITEM_RE.exec(inner)) !== null) {
    choices.push(unescapePythonQuoted(item[1] !== undefined ? item[1] : item[2]));
  }
  return choices.length > 0 ? choices : null;
}

/**
 * Reads the extended kwargs (see module comment) out of a constructor's raw
 * argument text: `label`, `description`, `visible_col`, and
 * `widget_options` (parsed as JSON and sanitized). None of this ever
 * evaluates `argsRaw` as code — only fixed regular expressions and
 * `JSON.parse` on a value that regex already required to be a quoted
 * string literal.
 */
function extractCommonKwargs(argsRaw, columnId, warnings) {
  const label = extractQuotedKwarg(argsRaw, "label");
  const description = extractQuotedKwarg(argsRaw, "description");
  const visibleColId = extractQuotedKwarg(argsRaw, "visible_col");
  const widgetOptionsRaw = extractQuotedKwarg(argsRaw, "widget_options");

  let widgetOptions = null;
  if (widgetOptionsRaw) {
    try {
      widgetOptions = sanitizeWidgetOptions(JSON.parse(widgetOptionsRaw));
    } catch {
      // Malformed JSON: ignored, never evaluated — just reported so it
      // isn't silently lost.
      warnings.push(`Colonne « ${columnId} » : widget_options n'est pas un JSON valide, ignoré.`);
    }
  }

  return { label, description, visibleColId, widgetOptions };
}

function mergeWidgetOptions(typeSpecific, restored) {
  if (!typeSpecific && !restored) return null;
  const merged = { ...(restored || {}), ...(typeSpecific || {}) };
  return Object.keys(merged).length > 0 ? merged : null;
}

/**
 * @param {string} dslType e.g. "Text", "Reference", "ChoiceList"
 * @param {string} argsRaw Raw text between the constructor's parentheses.
 * @param {string} columnId Used only to produce readable warnings.
 * @param {string[]} warnings Warnings are appended here.
 * @returns {{type: string, widgetOptions: (object|null), refTarget: (string|null),
 *   label: (string|null), description: (string|null), visibleColId: (string|null)}}
 */
export function resolveColumnType(dslType, argsRaw, columnId, warnings) {
  const meta = extractCommonKwargs(argsRaw, columnId, warnings);
  const base = resolveBareType(dslType, argsRaw, columnId, warnings);
  return {
    type: base.type,
    widgetOptions: mergeWidgetOptions(base.widgetOptions, meta.widgetOptions),
    refTarget: base.refTarget,
    label: meta.label,
    description: meta.description,
    visibleColId: meta.visibleColId,
  };
}

function resolveBareType(dslType, argsRaw, columnId, warnings) {
  switch (dslType) {
    case "Text":
    case "Numeric":
    case "Int":
    case "Bool":
    case "Date":
    case "Any":
      return { type: dslType, widgetOptions: null, refTarget: null };

    case "Choice":
      return { type: "Choice", widgetOptions: choicesWidgetOptions(argsRaw), refTarget: null };

    case "ChoiceList":
      return { type: "ChoiceList", widgetOptions: choicesWidgetOptions(argsRaw), refTarget: null };

    case "DateTime": {
      const timezone = extractFirstStringArg(argsRaw);
      if (!timezone) {
        warnings.push(
          `Colonne « ${columnId} » : fuseau horaire non précisé pour DateTime, « ${DEFAULT_TIMEZONE} » utilisé par défaut (à vérifier).`
        );
      }
      return { type: `DateTime:${timezone || DEFAULT_TIMEZONE}`, widgetOptions: null, refTarget: null };
    }

    case "Reference":
    case "ReferenceList": {
      const target = extractFirstStringArg(argsRaw);
      const prefix = dslType === "Reference" ? "Ref" : "RefList";
      if (!target || !TABLE_ID_RE.test(target)) {
        warnings.push(
          `Colonne « ${columnId} » : table cible introuvable pour ${dslType}, importée en tant que « Any ».`
        );
        return { type: "Any", widgetOptions: null, refTarget: null };
      }
      return { type: `${prefix}:${target}`, widgetOptions: null, refTarget: target };
    }

    case "Attachments":
      return { type: "Attachments", widgetOptions: null, refTarget: null };

    // Real but internal/legacy Grist type (see TYPE_DEFAULT_LITERALS above,
    // taken from the same usertypes.py `_type_defaults`): not offered by
    // Grist's own column-type picker, so unlikely in a real paste, but
    // handled explicitly rather than silently downgraded to Any.
    case "Blob":
      return { type: "Blob", widgetOptions: null, refTarget: null };

    default:
      warnings.push(
        `Colonne « ${columnId} » : type « ${dslType} » non reconnu, importée en tant que « Any ».`
      );
      return { type: "Any", widgetOptions: null, refTarget: null };
  }
}

function extractFirstStringArg(argsRaw) {
  const match = argsRaw.match(FIRST_STRING_ARG_RE);
  return match ? match[1] : null;
}

function choicesWidgetOptions(argsRaw) {
  const choices = extractChoicesKwarg(argsRaw);
  return choices ? { choices } : null;
}

/**
 * Human-readable (French) label for a resolved Grist `type` string, used
 * only for display in the preview table.
 */
export function describeType(type) {
  if (type.startsWith("DateTime:")) return `Date et heure (${type.slice("DateTime:".length)})`;
  if (type.startsWith("Ref:")) return `Référence vers « ${type.slice("Ref:".length)} »`;
  if (type.startsWith("RefList:")) return `Références vers « ${type.slice("RefList:".length)} » (liste)`;

  switch (type) {
    case "Text": return "Texte";
    case "Numeric": return "Numérique";
    case "Int": return "Entier";
    case "Bool": return "Case à cocher";
    case "Date": return "Date";
    case "Choice": return "Choix (liste déroulante)";
    case "ChoiceList": return "Choix multiples (liste déroulante)";
    case "Attachments": return "Pièces jointes";
    case "Blob": return "Binaire (Blob)";
    case "Any": return "Quelconque (Any)";
    default: return type;
  }
}

/**
 * Default value (as a Python literal) Grist uses for each pure column type,
 * taken verbatim from `_type_defaults` in Grist's own `sandbox/grist/usertypes.py`.
 * Used only to fill in `return <default>` for a formula column whose real
 * formula is blank — exactly what Grist's own Code View generator does.
 */
const TYPE_DEFAULT_LITERALS = {
  Any: "None",
  Attachments: "None",
  Blob: "None",
  Bool: "False",
  Choice: "''",
  ChoiceList: "None",
  Date: "None",
  DateTime: "None",
  Id: "0",
  Int: "0",
  Numeric: "0.0",
  Ref: "0",
  RefList: "None",
  Text: "''",
};

function getPureType(type) {
  const idx = type.indexOf(":");
  return idx === -1 ? type : type.slice(0, idx);
}

/**
 * Python literal (as text) for a blank column of the given Grist `type`,
 * e.g. "Text" -> "''", "Ref:Foo" -> "0".
 */
export function defaultLiteralForType(type) {
  return TYPE_DEFAULT_LITERALS[getPureType(type)] ?? "None";
}

/**
 * Inverse of resolveColumnType(): builds the `grist.Xxx(...)` constructor
 * expression for a real Grist column `type` string (e.g. "Ref:Foo",
 * "DateTime:UTC"), mirroring `get_grist_type()` in Grist's own
 * `sandbox/grist/gencode.py` (the code that generates "Code View") exactly,
 * including the Ref -> Reference / RefList -> ReferenceList renaming.
 * `reverse_of=...` is intentionally not reproduced (rare feature, see README).
 *
 * `kwargs`, if given, is a plain object of already-formatted `name` ->
 * `rawPythonSource` pairs (e.g. `{ label: "'Full name'" }`) appended, in
 * insertion order, as extra keyword arguments after the type's own leading
 * positional argument — this widget's own extension (see module comment),
 * built by js/codeGenerator.js. Omitted/empty, this behaves exactly as
 * before.
 */
export function buildTypeExpression(type, kwargs = {}) {
  const idx = type.indexOf(":");
  const rawName = idx === -1 ? type : type.slice(0, idx);
  const name = rawName === "Ref" ? "Reference" : rawName === "RefList" ? "ReferenceList" : rawName;
  const arg = (idx === -1 ? "" : type.slice(idx + 1)).trim().replace(/'/g, "\\'");

  const parts = [];
  if (arg) parts.push(`'${arg}'`);
  for (const [key, value] of Object.entries(kwargs)) {
    if (value === undefined || value === null) continue;
    parts.push(`${key}=${value}`);
  }
  return `grist.${name}(${parts.join(", ")})`;
}

export { TABLE_ID_RE };
