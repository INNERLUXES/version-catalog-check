import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOML_LIMITS, TomlError, entryOf, newTable, parseToml } from '../src/index.js';
import { CATALOG, lineOf } from './helpers.js';

// The TOML reader of the catalog: the part of TOML 1.0 a catalog uses, the offsets of keys and values, and what it
// refuses with its place.

const problem = (text) => {
  try {
    parseToml(text);
  } catch (error) {
    assert.ok(error instanceof TomlError, error.message);
    return error;
  }
  return assert.fail('not refused');
};
const plain = (node) => {
  if (node.kind === 'table') return Object.fromEntries([...node.entries].map(([k, v]) => [k, plain(v)]));
  if (node.kind === 'array') return node.items.map(plain);
  return node.value;
};

test('toml: tables, inline tables, dotted keys, arrays over several lines and every scalar', () => {
  const root = parseToml('a = "x"\n[t]\nk = { m = "g:n", version.ref = "v" }\nlist = [\n  "a", # one\n  \'b\',\n]\nn = 3\nf = 1.5\nyes = true\nno = false\nq."dotted key".r = "s"\n');
  assert.deepEqual(plain(root), { a: 'x', t: { k: { m: 'g:n', version: { ref: 'v' } }, list: ['a', 'b'], n: '3', f: '1.5', yes: true, no: false, q: { 'dotted key': { r: 's' } } } });
  assert.equal(entryOf(root, 't').entries.get('n').kind, 'integer');
  assert.equal(entryOf(root, 't').entries.get('f').kind, 'float');
  assert.equal(entryOf(root, 'missing'), undefined);
  assert.equal(entryOf(null, 'a'), undefined);
});

test('toml: the strings: escapes, literal strings, multi-line strings and a line-ending backslash', () => {
  const root = parseToml('a = "x\\ty\\u0041\\U0001F600\\\\"\nb = \'c:\\\\path\'\nc = """\nline one\nline two"""\nd = \'\'\'\nraw \\n\'\'\'\ne = """one \\\n    two"""\nf = """ends with quotes" """\n');
  const v = (k) => root.entries.get(k).value;
  assert.equal(v('a'), `x\tyA${String.fromCodePoint(0x1f600)}\\`);
  assert.equal(v('b'), 'c:\\\\path');
  assert.equal(v('c'), 'line one\nline two');
  assert.equal(v('d'), 'raw \\n');
  assert.equal(v('e'), 'one two');
  assert.equal(v('f'), 'ends with quotes" ');
});

test('toml: the offset of every key and value, with CRLF line ends too', () => {
  for (const text of [CATALOG, CATALOG.split('\n').join('\r\n')]) {
    const root = parseToml(text);
    const lib = entryOf(entryOf(root, 'libraries'), 'room-runtime');
    assert.equal(text.slice(lib.keyOffset, lib.keyOffset + 'room-runtime'.length), 'room-runtime');
    assert.equal(text[lib.offset], '{');
    const ref = lib.entries.get('version').entries.get('ref');
    assert.equal(text.slice(ref.offset, ref.offset + 6), '"room"');
    assert.ok(lineOf(text, 'room-runtime = ') > 1);
  }
});

test('toml: a key or a table defined twice, and a dotted key into a value, are refused with their place', () => {
  const twice = problem('[versions]\na = "1"\na = "2"\n');
  assert.match(twice.reason, /the key a is defined twice/);
  assert.equal(twice.offset, '[versions]\na = "1"\n'.length);
  assert.match(problem('[a]\n[a]\n').reason, /the table \[a\] is defined twice/);
  assert.match(problem('a = 1\na.b = 2\n').reason, /already defined, so it cannot be extended/);
  assert.match(problem('a = 1\n[a]\n').reason, /is already a value, so it cannot be a table/);
  assert.match(problem('x = { a = 1, a = 2 }\n').reason, /defined twice/);
  assert.deepEqual(plain(parseToml('[a.b]\nc = 1\n[a]\nd = 2\n')), { a: { b: { c: '1' }, d: '2' } }, 'a table first named as part of a header may get its own header once');
});

test('toml: what a catalog does not use and what TOML forbids is refused, each with a reason', () => {
  for (const [text, reason] of [
    ['[[libraries]]\n', /an array of tables/],
    [`a = ${['19', '79'].join('')}-05-27\n`, /a date or a time/],
    ['a = 07:32:00\n', /a date or a time/],
    ['a = 1.2.0\n', /a version is written in quotes/],
    ['a = "open\n', /a line end inside a string/],
    ['a = "x"y\n', /a line end after the value was expected/],
    ['a = { b = 1,\n c = 2 }\n', /an inline table that does not close on its line/],
    ['a = { b = 1, }\n', /a comma before the closing brace/],
    ['a = [1 2]\n', /a comma or a closing bracket was expected/],
    ['a\n', /an equals sign after the key was expected/],
    ['= 1\n', /where a key was expected/],
    ['a = \n', /a value was expected before the end of the line/],
    ['a = @\n', /the character "@" where a value was expected/],
    ['a = "\\q"\n', /an escape \\q that TOML does not have/],
    ['a = "\\u12"\n', /four hexadecimal digits/],
    ['a = "\\uD800"\n', /not a Unicode scalar value/],
    ['a = "x\u0001"\n', /a control character inside a string/],
    ['# x\u0007\n', /a control character in a comment/],
    ['[a\n', /a closing bracket after the table name was expected/],
    ['"""k""" = 1\n', /a multi-line string cannot be a key/],
    ['a = """open\n', /a string that is not closed/]
  ]) assert.match(problem(text).reason, reason, JSON.stringify(text));
});

test('toml: the limits of depth, values, strings and key parts', () => {
  assert.match(problem(`a = ${'['.repeat(20)}${']'.repeat(20)}\n`).reason, /nested more than 16 deep/);
  assert.throws(() => parseToml('a = [1, 2, 3, 4]\n', { maxValues: 3 }), /more than 3 values/);
  assert.throws(() => parseToml(`a = "${'x'.repeat(50)}"\n`, { maxStringLength: 10 }), /a string longer than 10 characters/);
  assert.throws(() => parseToml(`${Array.from({ length: 20 }, (_, i) => `k${i}`).join('.')} = 1\n`), /a key of more than 16 parts/);
  assert.equal(TOML_LIMITS.maxDepth, 16);
});

test('toml: a byte order mark, comments, empty lines and CR LF are read; __proto__ is only a name', () => {
  const root = parseToml(`${String.fromCharCode(0xfeff)}# c\r\n\r\n[t] # c\r\n__proto__ = "x"\r\nconstructor = { toString = "y" }\r\n`);
  const t = root.entries.get('t');
  assert.equal(t.entries.get('__proto__').value, 'x');
  assert.equal(t.entries.get('constructor').entries.get('toString').value, 'y');
  assert.equal({}.x, undefined);
  assert.equal(newTable(0, 'root').entries.size, 0);
  assert.deepEqual(plain(parseToml('a = []\nb = {}\n')), { a: [], b: {} });
});
