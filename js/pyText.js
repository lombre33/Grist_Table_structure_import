/** Python source text, read and written without ever evaluating it. */

const ESCAPED = { "\\": "\\\\", "'": "\\'", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const UNESCAPED = { n: "\n", r: "\r", t: "\t" };
const STRING_LITERAL = /^(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")$/s;

/** `text` as a single-quoted literal that stays on one line. */
export function quotePython(text) {
  return `'${String(text).replace(/[\\'\n\r\t]/g, (ch) => ESCAPED[ch])}'`;
}

/** The value of a string literal given as source text (either quote style, inverse of quotePython), or null. */
export function parseString(source) {
  const match = source?.match(STRING_LITERAL);
  return match ? (match[1] ?? match[2]).replace(/\\(.)/g, (_, ch) => UNESCAPED[ch] ?? ch) : null;
}

/** [index, character, depth] of every character outside a string literal; depth counts the brackets open around it. */
function* codeChars(text, from = 0) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else {
      if (")]}".includes(ch)) depth--;
      yield [i, ch, depth];
      if ("([{".includes(ch)) depth++;
    }
  }
}

/** Index of the bracket closing the one at `openIndex` (a `)` inside 'Oui (confirmé)' does not count), or -1. */
export function findMatchingClose(text, openIndex) {
  if (!"([{".includes(text[openIndex])) return -1;
  for (const [i, ch, depth] of codeChars(text, openIndex)) if (")]}".includes(ch) && depth === 0) return i;
  return -1;
}

/** The arguments of a call as source text: `'People', visible_col='Name'` gives positional ["'People'"] and kwargs { visible_col: "'Name'" }. */
export function parseArguments(text) {
  const pieces = [];
  let start = 0;
  for (const [i, ch, depth] of codeChars(text)) {
    if (ch === "," && depth === 0) {
      pieces.push(text.slice(start, i));
      start = i + 1;
    }
  }
  pieces.push(text.slice(start));

  const positional = [];
  const kwargs = {};
  for (const piece of pieces.map((item) => item.trim()).filter(Boolean)) {
    const named = piece.match(/^([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/);
    if (named) kwargs[named[1]] = named[2];
    else positional.push(piece);
  }
  return { positional, kwargs };
}

/** The strings of a list literal given as source text (`['a', "b"]`), or null when there is none. */
export function parseStringList(source) {
  if (!source?.startsWith("[") || !source.endsWith("]")) return null;
  const items = parseArguments(source.slice(1, -1)).positional.map(parseString).filter((item) => item !== null);
  return items.length > 0 ? items : null;
}
