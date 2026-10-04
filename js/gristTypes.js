/** The Grist column types, between a column's `type` string ("Ref:People") and its Code View constructor (`grist.Reference('People')`). */

import { parseArguments, parseString, parseStringList, quotePython } from "./pyText.js";
import { sanitizeWidgetOptions } from "./widgetOptions.js";

export const RESERVED_COLUMN_IDS = new Set(["id", "manualSort"]);

const DEFAULT_TIMEZONE = "UTC";
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
  const name = TYPE_OF_DSL.get(dslType);
  const spec = TYPES[name];
  let type = name ?? "Any";
  let refTarget = null;

  if (!name) {
    warn("warn.unknownType", { dslType });
  } else if (spec.arg === "table") {
    refTarget = parseString(positional[0]);
    if (refTarget && IDENTIFIER_RE.test(refTarget)) {
      type = `${name}:${refTarget}`;
    } else {
      warn("warn.refTargetMissingSyntax", { dslType });
      [type, refTarget] = ["Any", null];
    }
  } else if (spec.arg === "timezone") {
    const timezone = parseString(positional[0]);
    if (!timezone) warn("warn.dateTimeNoTimezone", { timezone: DEFAULT_TIMEZONE });
    type = `DateTime:${timezone || DEFAULT_TIMEZONE}`;
  }

  const choices = spec?.choices ? parseStringList(kwargs.choices) : null;
  const options = { ...restoredOptions(kwargs.widget_options, warn), ...(choices && { choices }) };
  return {
    type,
    widgetOptions: Object.keys(options).length > 0 ? options : null,
    refTarget,
    label: parseString(kwargs.label),
    description: parseString(kwargs.description),
    visibleColId: parseString(kwargs.visible_col),
    reverseColId: parseString(kwargs.reverse_of),
  };
}

/** The `widget_options='<JSON>'` argument, parsed (never evaluated) and sanitized. */
function restoredOptions(source, warn) {
  const json = parseString(source);
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
