const ESCAPED = { "\\": "\\\\", "'": "\\'", "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const UNESCAPED = { n: "\n", r: "\r", t: "\t" };

/** `text` as a single-quoted Python literal that stays on one line. */
export function quotePython(text) {
  return `'${String(text).replace(/[\\'\n\r\t]/g, (ch) => ESCAPED[ch])}'`;
}

/** Inverse of quotePython, applied to what lies between the quotes (of either style). */
export function unquotePython(inner) {
  return inner.replace(/\\(.)/g, (_, ch) => UNESCAPED[ch] ?? ch);
}
