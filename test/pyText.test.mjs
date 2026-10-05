import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchingClose, indentOf, parseArguments, parseString, parseStringList, quotePython, stringLines, withoutComment } from "../js/pyText.js";

test("quotePython escapes what would end the literal or break the line", () => {
  assert.equal(quotePython("it's"), "'it\\'s'");
  assert.equal(quotePython("a\\b"), "'a\\\\b'");
  assert.equal(quotePython("1\n2\r3\t4"), "'1\\n2\\r3\\t4'");
  assert.equal(quotePython('say "hi"'), `'say "hi"'`);
});

test("parseString reads Python escapes, and keeps the character of an unknown one", () => {
  assert.equal(parseString("'1\\n2\\r3\\t4'"), "1\n2\r3\t4");
  assert.equal(parseString("'it\\'s \\\"x\\\"'"), `it's "x"`);
  assert.equal(parseString("'a\\\\nb'"), "a\\nb", "an escaped backslash is not the start of another escape");
  assert.equal(parseString("'\\d'"), "d");
});

test("parseString inverts quotePython for any text", () => {
  for (const text of ["", "'", "\\", "\\n", "\n\\n", "'\\'", "é😀", "a'b\"c\\d\ne"]) {
    assert.equal(parseString(quotePython(text)), text);
  }
});

test("parseString reads either quote style, and only a whole literal", () => {
  assert.equal(parseString("'it\\'s'"), "it's");
  assert.equal(parseString('"say \\"hi\\""'), 'say "hi"');
  assert.equal(parseString("''"), "");
  for (const source of ["abc", "'a' + 'b'", "'unterminated", undefined]) assert.equal(parseString(source), null, String(source));
});

test("findMatchingClose skips brackets inside quoted strings", () => {
  const text = "(choices=['Oui (confirmé)', \"B]\"])";
  assert.equal(findMatchingClose(text, 0), text.length - 1);
});

test("findMatchingClose handles escaped quotes, nesting and an unterminated bracket", () => {
  const text = "('it\\'s (nested)')";
  assert.equal(findMatchingClose(text, 0), text.length - 1);
  assert.equal(findMatchingClose("(a(b)c)d", 0), 6);
  assert.equal(findMatchingClose("(abc", 0), -1);
  assert.equal(findMatchingClose("abc)", 0), -1, "not an opening bracket");
});

test("parseArguments splits at top-level commas only", () => {
  const { positional, kwargs } = parseArguments("'People', visible_col='Name', choices=['a, b', 'c'], widget_options='{\"x\": [1, 2]}'");
  assert.deepEqual(positional, ["'People'"]);
  assert.deepEqual(kwargs, { visible_col: "'Name'", choices: "['a, b', 'c']", widget_options: "'{\"x\": [1, 2]}'" });
});

test("parseArguments copes with nothing, a trailing comma and spaces around =", () => {
  assert.deepEqual(parseArguments(""), { positional: [], kwargs: {} });
  assert.deepEqual(parseArguments("'A', label = 'B' ,"), { positional: ["'A'"], kwargs: { label: "'B'" } });
});

test("a comment ends a line of code, a # inside a string does not", () => {
  assert.equal(withoutComment("A = grist.Text()  # note"), "A = grist.Text()");
  assert.equal(withoutComment("x = 'a # b'  # c"), "x = 'a # b'");
  assert.equal(withoutComment("x = \"it's # b\" # c"), "x = \"it's # b\"");
  assert.equal(withoutComment("x = 'a \\' # b'"), "x = 'a \\' # b'", "an escaped quote does not end the string");
  assert.equal(withoutComment("# only a comment"), "");
  assert.equal(withoutComment("A = grist.Text()  # c'est"), "A = grist.Text()");
  assert.equal(withoutComment("no comment"), "no comment");
});

test("indentation is made of spaces, tabs and the no-break spaces of a text copied from a web page", () => {
  assert.equal(indentOf("\u00a0\u00a0 \tx"), 4);
  assert.equal(indentOf("x  "), 0);
  assert.equal(indentOf("\u00a0"), 1);
});

test("parseStringList tells of the items it leaves out, which are not strings", () => {
  const skipped = [];
  assert.deepEqual(parseStringList("['a', b, 3, \"c\"]", (piece) => skipped.push(piece)), ["a", "c"]);
  assert.deepEqual(skipped, ["b", "3"]);
});

test("parseStringList reads the strings of a list, whatever they contain", () => {
  assert.deepEqual(parseStringList("['a', \"b\", 'it\\'s', 'x, y', '']"), ["a", "b", "it's", "x, y", ""]);
  for (const source of ["[]", "['a'", "'a'", "('a', 'b')", undefined]) assert.equal(parseStringList(source), null, String(source));
});

test("stringLines flags the lines that start inside a triple-quoted string, and only those", () => {
  const flags = (text) => stringLines(text.split("\n"));
  assert.deepEqual(flags('a = 1\nx = """first\n# not a comment\n  indented\n\nlast"""\ny = 2'), [false, false, true, true, true, true, false]);
  assert.deepEqual(flags("s = '''a\"\"\"b\nc''' + 'd'\nz = 1"), [false, true, false], "the other kind of triple quote is part of the text");
  assert.deepEqual(flags('x = "it\'s" # """ not a string\ny = 3'), [false, false], "a quote in a comment or in another string opens nothing");
  assert.deepEqual(flags('e = ""\nf = """"""\ng = 1'), [false, false, false], "empty strings are closed");
  assert.deepEqual(flags('x = """a \\""" still\nin""" + 1\nout'), [false, true, false], "an escaped quote does not close it");
  assert.deepEqual(flags('u = "unclosed\nnext'), [false, false], "a single-quoted string ends with its line");
});

test("stringLines also flags what Grist leaves unindented without triple quotes: a backslash-continued string, literals joined over lines", () => {
  const flags = (text) => stringLines(text.split("\n"));
  assert.deepEqual(flags("x = 'a\\\nb'\ny = 2"), [false, true, false]);
  assert.deepEqual(flags('x = ("a"\n"b"\n  r"c")\ny = ("d"\n)\nz = "e"\n"f"'), [false, true, true, false, false, false, false], "literals are joined inside brackets only");
  assert.deepEqual(flags('x = ("a"  # note\n# comment\n\n"b")\nz'), [false, true, true, true, false], "what lies between them belongs to the string");
  assert.deepEqual(flags('x = "a" \\\n"b"\ny'), [false, true, false], "or after a backslash");
  assert.deepEqual(flags('x = "a" + \\\n"b"'), [false, false], "but not over an operator");
});

test("stringLines takes a triple-quoted string that is never closed for no string, and reads the text after it", () => {
  assert.deepEqual(stringLines('x = """oops\nnext\n'.split("\n")), [false, false, false]);
  assert.deepEqual(stringLines('x = """oops\ny = "a\nb"\nz = "c"'.split("\n")), [false, false, false, false], "a later string ends with its line, never joined");
});

test("stringLines knows the prefixes of Python strings", () => {
  for (const prefix of ["r", "b", "f", "u", "rb", "BR", "Rf", "fR"]) assert.deepEqual(stringLines(`x = ${prefix}"""a\nb"""\ny`.split("\n")), [false, true, false], prefix);
});

test("a text full of triple quotes that never close is read in linear time: each opener does not go through the rest of the text again", () => {
  for (const unit of ['\\"""', "\\'''", '\\"""\n']) {
    const started = performance.now();
    stringLines(unit.repeat(20000).split("\n"));
    assert.ok(performance.now() - started < 1000, `${JSON.stringify(unit)} repeated 20000 times took as long as a walk to the end of the text for each opener`);
  }
});

test("a triple quote that closes after many escaped ones is still one string, and the lines inside it are flagged", () => {
  const text = `x = '''${'\\\'\'\'\n'.repeat(500)}'''\ny = 1`;
  const flags = stringLines(text.split("\n"));
  assert.equal(flags.length, 502);
  assert.deepEqual([flags[0], flags[1], flags[500], flags[501]], [false, true, true, false], "the lines after the first, up to the one with the closing quotes, start inside the string");
});
