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

/** The number of spaces and tabs a line starts with. */
export const indentOf = (line) => line.match(/^[ \t]*/)[0].length;

const WORD = /\w+/y;
const STRING_PREFIX = /^(?:[rubf]|r[bf]|[bf]r)$/i;
const isQuote = (ch) => ch === "'" || ch === '"';

/**
 * Index after the string whose opening quotes are at `at`: the end of its line when a single-quoted one is
 * left open, -1 when a triple-quoted one is never closed. A backslash escapes the next character, a line break included.
 */
function stringEnd(text, at) {
  const delimiter = text.startsWith(text[at].repeat(3), at) ? text[at].repeat(3) : text[at];
  for (let i = at + delimiter.length; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text.startsWith(delimiter, i)) return i + delimiter.length;
    else if (text[i] === "\n" && delimiter.length === 1) return i;
  }
  return delimiter.length === 1 ? text.length : -1;
}

/**
 * [start, end) of every string of Python in `text`. Literals that follow one another make one string, as
 * Python reads them: after a backslash, or inside brackets, over comments and line breaks.
 */
function stringRanges(text) {
  const ranges = [];
  let joined = null; // the string, or the strings, being read
  let depth = 0; // brackets open: only outside them does a line break end a statement
  const endJoined = () => {
    if (joined) ranges.push(joined);
    joined = null;
  };
  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    WORD.lastIndex = i;
    const word = WORD.exec(text)?.[0] ?? "";
    const quote = i + (STRING_PREFIX.test(word) ? word.length : 0);
    if (isQuote(text[quote])) {
      const end = stringEnd(text, quote);
      if (end === -1) {
        endJoined(); // opened and never closed: not a string, the quotes mean nothing
        i = quote + 3;
      } else {
        joined = [joined?.[0] ?? i, end];
        i = end;
      }
    } else if (ch === "#") {
      i = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i);
    } else if (ch === "\n") {
      if (depth === 0) endJoined();
      i++;
    } else if (ch === "\\" && text[i + 1] === "\n") {
      i += 2;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      endJoined(); // a name, a number, an operator or a bracket
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth = Math.max(0, depth - 1);
      i += Math.max(word.length, 1);
    }
  }
  endJoined();
  return ranges;
}

/**
 * Whether each line starts inside a string of Python that goes over several lines: triple-quoted, continued by a
 * backslash, or made of literals joined over lines (`("a"\n"b")`). Grist 1.7.20 and later write the lines of such a
 * string in a formula as they are, unindented, so their indentation says nothing about the layout around them.
 */
export function stringLines(lines) {
  const ranges = stringRanges(lines.join("\n"));
  let next = 0; // the first string that may still contain a line break
  let start = 0; // offset of the line
  return lines.map((line) => {
    const lineBreak = start - 1; // before this line
    start += line.length + 1;
    while (next < ranges.length && ranges[next][1] <= lineBreak) next++;
    return next < ranges.length && ranges[next][0] <= lineBreak;
  });
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
