/** The widgetOptions of a column that this widget agrees to carry from one document to another. */

const isColor = (value) => typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
const isFlag = (value) => typeof value === "boolean";

// Styles, for a choice or for the column itself: only values Grist itself accepts. Maps, so that a key
// such as `constructor` is no style.
const STYLES = new Map(Object.entries({ textColor: isColor, fillColor: isColor, fontBold: isFlag, fontItalic: isFlag, fontUnderline: isFlag, fontStrikethrough: isFlag }));
const COLUMN_STYLES = new Map([
  ...STYLES,
  ...Object.entries({
    headerTextColor: isColor,
    headerFillColor: isColor,
    headerFontBold: isFlag,
    headerFontItalic: isFlag,
    headerFontUnderline: isFlag,
    headerFontStrikethrough: isFlag,
    wrap: isFlag,
    isCustomDateFormat: isFlag,
    isCustomTimeFormat: isFlag,
  }),
]);

export const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmpty = (object) => (Object.keys(object).length > 0 ? object : undefined);

function sanitizeChoiceOptions(choiceOptions) {
  if (!isPlainObject(choiceOptions)) return undefined;
  const styles = Object.entries(choiceOptions).map(([choice, style]) => {
    const valid = isPlainObject(style) ? Object.entries(style).filter(([key, value]) => STYLES.get(key)?.(value)) : [];
    return [choice, nonEmpty(Object.fromEntries(valid))];
  });
  return nonEmpty(Object.fromEntries(styles.filter(([, style]) => style)));
}

/**
 * `options` without what must not travel, or null when nothing is left. `choices`
 * has its own `choices=[...]`; `rulesOptions` means nothing without the column's
 * `rules`; a dropdown condition is rebuilt by Grist from its text alone.
 */
export function sanitizeWidgetOptions(options) {
  if (!isPlainObject(options)) return null;
  const kept = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === "choices" || key === "rulesOptions" || key === "__proto__") continue;
    let checked = value;
    if (key === "choiceOptions") checked = sanitizeChoiceOptions(value);
    else if (key === "dropdownCondition") checked = typeof value?.text === "string" && value.text ? { text: value.text } : undefined;
    else if (COLUMN_STYLES.has(key)) checked = COLUMN_STYLES.get(key)(value) ? value : undefined;
    if (checked !== undefined) kept[key] = checked;
  }
  return nonEmpty(kept) ?? null;
}
