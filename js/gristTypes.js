/**
 * Maps the small set of Grist Python DSL type constructors (as they appear
 * in a table's "Code View": grist.Text(), grist.Choice(), grist.Reference(),
 * ...) to the column `type` strings and `widgetOptions` expected by the
 * Grist "AddTable" / "AddColumn" user actions.
 *
 * Argument parsing below only ever extracts a leading quoted string literal
 * or a `choices=[...]` list via fixed regular expressions. It never
 * evaluates the constructor arguments as code.
 */

const FIRST_STRING_ARG_RE = /^\s*['"]([^'"]*)['"]/;
const CHOICES_KWARG_RE = /choices\s*=\s*\[([^\]]*)\]/;
const QUOTED_ITEM_RE = /'([^']*)'|"([^"]*)"/g;
const DEFAULT_TIMEZONE = "UTC";

const TABLE_ID_RE = /^[A-Za-z_]\w*$/;

/**
 * @param {string} dslType e.g. "Text", "Reference", "ChoiceList"
 * @param {string} argsRaw Raw text between the constructor's parentheses.
 * @param {string} columnId Used only to produce readable warnings.
 * @param {string[]} warnings Warnings are appended here.
 * @returns {{type: string, widgetOptions: (object|null), refTarget: (string|null)}}
 */
export function resolveColumnType(dslType, argsRaw, columnId, warnings) {
  switch (dslType) {
    case "Text":
    case "Numeric":
    case "Int":
    case "Bool":
    case "Date":
    case "Any":
      return { type: dslType, widgetOptions: null, refTarget: null };

    case "Choice":
      return { type: "Choice", widgetOptions: extractChoicesOptions(argsRaw), refTarget: null };

    case "ChoiceList":
      return { type: "ChoiceList", widgetOptions: extractChoicesOptions(argsRaw), refTarget: null };

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

function extractChoicesOptions(argsRaw) {
  const match = argsRaw.match(CHOICES_KWARG_RE);
  if (!match) return null;

  const choices = [];
  let item;
  QUOTED_ITEM_RE.lastIndex = 0;
  while ((item = QUOTED_ITEM_RE.exec(match[1])) !== null) {
    choices.push(item[1] !== undefined ? item[1] : item[2]);
  }
  return choices.length > 0 ? { choices } : null;
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
    case "Any": return "Quelconque (Any)";
    default: return type;
  }
}

export { TABLE_ID_RE };
