/** The Grist column types, between a column's `type` string ("Ref:People") and its Code View constructor (`grist.Reference('People')`). */

import { parseArguments, parseString, parseStringList, quotePython } from "./pyText.js";
import { sanitizeWidgetOptions } from "./widgetOptions.js";

const RESERVED_COLUMN_IDS = new Set(["id", "manualSort"]);
/** The ids Grist keeps for itself: its own two columns, and the helper columns it hides (`gristHelper_Display`). Neither is exported, and none is imported. */
export const isReservedColumnId = (colId) => RESERVED_COLUMN_IDS.has(colId) || colId.startsWith("gristHelper_");

const DEFAULT_TIMEZONE = "UTC";
/**
 * What the name of a time zone looks like (`UTC`, `Europe/Paris`, `America/Argentina/Buenos_Aires`, `Etc/GMT+5`).
 * It goes into the type of the column, which Grist writes into the generated code of the document: nothing else may go there.
 */
const TIMEZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]{0,39}(?:\/[A-Za-z0-9_+-]{1,40}){0,3}$/;
const SHOWN_LENGTH = 40; // of a text given by the user, when a warning quotes it
const shown = (text) => (text.length > SHOWN_LENGTH ? `${text.slice(0, SHOWN_LENGTH)}…` : text);
const EMPTY_LIST_RE = /^\[\s*\]$/;
const IDENTIFIER_RE = /^[A-Za-z_]\w*$/;

// dsl: the constructor's name in Code View; blank: the Python value of a blank formula (usertypes.py `_type_defaults`);
// arg: what the constructor's first argument is, if it has one; choices: whether it lists choices.
const TYPES = {
  Text: { dsl: "Text", blank: "''" },
  Numeric: { dsl: "Numeric", blank: "0.0" },
  Int: { dsl: "Int", blank: "0" },
  Bool: { dsl: "Bool", blank: "False" },
  Date: { dsl: "Date", blank: "None" },
  DateTime: { dsl: "DateTime", blank: "None", arg: "timezone" },
  Choice: { dsl: "Choice", blank: "''", choices: true },
  ChoiceList: { dsl: "ChoiceList", blank: "None", choices: true },
  Ref: { dsl: "Reference", blank: "0", arg: "table" },
  RefList: { dsl: "ReferenceList", blank: "None", arg: "table" },
  Attachments: { dsl: "Attachments", blank: "None" },
  Blob: { dsl: "Blob", blank: "None" },
  Any: { dsl: "Any", blank: "None" },
};
const TYPE_OF_DSL = new Map(Object.entries(TYPES).map(([type, { dsl }]) => [dsl, type])); // a Map: `constructor` is no type

/** "Ref:People" gives { name: "Ref", arg: "People" }. */
export function splitType(type) {
  const colon = type.indexOf(":");
  return colon === -1 ? { name: type, arg: "" } : { name: type.slice(0, colon), arg: type.slice(colon + 1) };
}

/**
 * Reads a column's constructor (`dslType`, `argsRaw`: the text between its parentheses). Warnings
 * ({ key, params }) are pushed to `warnings`; a type that cannot be used becomes `Any`.
 * @returns {{type: string, widgetOptions: ?object, refTarget: ?string, label: ?string,
 *   description: ?string, visibleColId: ?string, reverseColId: ?string}}
 */
export function resolveColumnType(dslType, argsRaw, colId, warnings) {
  const { positional, kwargs } = parseArguments(argsRaw);
  const warn = (key, params) => warnings.push({ key, params: { colId, ...params } });
  /** The string given for `option`; an option that is there but is not a string literal is said to be ignored. */
  const readString = (option) => {
    const value = parseString(kwargs[option]);
    if (value === null && kwargs[option] !== undefined) warn("warn.unreadableOption", { option, given: shown(kwargs[option]) });
    return value;
  };
  const { type, refTarget } = typeOf(dslType, positional, warn);
  const hasChoices = TYPES[TYPE_OF_DSL.get(dslType)]?.choices;
  const choices = hasChoices ? readChoices(kwargs.choices, (given) => warn("warn.unreadableOption", { option: "choices", given })) : null;
  const options = { ...restoredOptions(readString("widget_options"), warn), ...(choices && { choices }) };
  return {
    type,
    widgetOptions: Object.keys(options).length > 0 ? options : null,
    refTarget,
    label: readString("label"),
    description: readString("description"),
    visibleColId: readString("visible_col"),
    reverseColId: readString("reverse_of"),
  };
}

/** The type of a column from the constructor's name and its first argument, with the table a reference points to (null for the others); what cannot be used becomes `Any`, with a warning. */
function typeOf(dslType, positional, warn) {
  const name = TYPE_OF_DSL.get(dslType);
  if (!name) {
    warn("warn.unknownType", { dslType });
    return { type: "Any", refTarget: null };
  }
  const { arg } = TYPES[name];
  if (arg === "table") {
    const refTarget = parseString(positional[0]);
    if (refTarget && IDENTIFIER_RE.test(refTarget)) return { type: `${name}:${refTarget}`, refTarget };
    warn("warn.refTargetMissingSyntax", { dslType });
    return { type: "Any", refTarget: null };
  }
  return { type: arg === "timezone" ? `${name}:${timezoneOf(positional[0], warn)}` : name, refTarget: null };
}

/** The time zone a DateTime column is written with; a name that is none, or no name, gives UTC, with a warning. */
function timezoneOf(source, warn) {
  const given = parseString(source);
  if (given && TIMEZONE_RE.test(given)) return given;
  warn(given ? "warn.dateTimeBadTimezone" : "warn.dateTimeNoTimezone", { timezone: DEFAULT_TIMEZONE, given: shown(given ?? "") });
  return DEFAULT_TIMEZONE;
}

/** The `choices=[...]` argument as a list of strings; what cannot be read in it is left out and said, through `unreadable`, with what was given. */
function readChoices(source, unreadable) {
  if (source === undefined) return null;
  let skipped = false;
  const choices = parseStringList(source, () => (skipped = true));
  if (skipped || (choices === null && !EMPTY_LIST_RE.test(source))) unreadable(shown(source));
  return choices;
}

/** The `widget_options='<JSON>'` argument, as the string read from it: parsed (never evaluated) and sanitized. */
function restoredOptions(json, warn) {
  if (!json) return null;
  try {
    return sanitizeWidgetOptions(JSON.parse(json));
  } catch {
    warn("warn.invalidWidgetOptions");
    return null;
  }
}

/**
 * The constructor of a column type, as Code View spells it (`get_grist_type` in gencode.py). `kwargs`
 * are further arguments, already Python source: { label: "'Name'" } gives `label='Name'`.
 */
export function buildTypeExpression(type, kwargs = {}) {
  const { name, arg } = splitType(type);
  const args = [...(arg ? [quotePython(arg.trim())] : []), ...Object.entries(kwargs).map(([key, value]) => `${key}=${value}`)];
  return `grist.${TYPES[name]?.dsl ?? name}(${args.join(", ")})`;
}

/** The Python value of a blank column of this type, `''` for "Text". */
export function defaultLiteralForType(type) {
  return TYPES[splitType(type).name]?.blank ?? "None";
}
