import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSON_LIMITS, JsonError, jsonProblem, parseJson } from '../src/index.js';

// The strict JSON reader: the grammar of RFC 8259, a repeated name refused, and the line and column of every value.

const problem = (text, limits) => {
  try {
    parseJson(text, limits);
  } catch (error) {
    assert.ok(error instanceof JsonError, error.message);
    return jsonProblem(error, text);
  }
  return assert.fail('not refused');
};

test('json: values of every kind, and the line and column of each value', () => {
  const { value, lines, columns } = parseJson('{\n  "a": [1, -2.5e3, true, false, null],\n  "b": {"c": "x\\u0041\\n"}\n}');
  assert.deepEqual(value, { a: [1, -2500, true, false, null], b: { c: 'xA\n' } });
  assert.equal(lines.get('a'), 2);
  assert.equal(columns.get('a'), 8);
  assert.equal(lines.get('a[1]'), 2);
  assert.equal(columns.get('a[1]'), 12);
  assert.equal(lines.get('b.c'), 3);
  assert.equal(lines.get(''), 1);
});

test('json: only the values nested up to linesUpTo have a line', () => {
  const { lines } = parseJson('{"a": {"b": {"c": 1}}}', { linesUpTo: 2 });
  assert.ok(lines.has('a.b'));
  assert.ok(!lines.has('a.b.c'));
});

test('json: a repeated name is refused, as RFC 8259 leaves the result open', () => {
  assert.match(problem('{"id": "a", "id": "b"}'), /^line 1, column 13: the name "id" appears twice in one object; RFC 8259 says the behavior of software that receives such an object is unpredictable/);
});

test('json: comments, trailing commas, single quotes, bad escapes, control characters and text after the value are refused', () => {
  assert.match(problem('{"a": 1, // x\n}'), /a name in double quotes was expected/);
  assert.match(problem('[1, // x\n]'), /a comment; JSON has no comments/);
  assert.match(problem('{"a": 1,}'), /a comma before the closing brace; JSON has no trailing comma/);
  assert.match(problem('[1,]'), /a comma before the closing bracket/);
  assert.match(problem("['a']"), /a string in single quotes/);
  assert.match(problem('["\\x"]'), /an escape \\x that JSON does not have/);
  assert.match(problem('["\\u12"]'), /four hexadecimal digits/);
  assert.match(problem('["a\tb"]'), /a control character inside a string/);
  assert.match(problem('[1] x'), /text after the end of the value/);
  assert.match(problem('[01]'), /a comma or a closing bracket was expected/);
  assert.match(problem('[1e999]'), /a number too large to read/);
  assert.match(problem('"open'), /a string that is not closed/);
  assert.match(problem(''), /the text ends where a value was expected/);
  assert.match(problem('{"a" 1}'), /a colon after the name was expected/);
  assert.match(problem('{"a": 1 "b": 2}'), /a comma or a closing brace was expected/);
  assert.match(problem('[NaN]'), /the character "N" where a value was expected/);
});

test('json: the limits of depth, values and string length', () => {
  assert.match(problem('['.repeat(40) + ']'.repeat(40)), /values nested more than 32 deep/);
  assert.match(problem('[1,2,3]', { maxValues: 3 }), /more than 3 values/);
  assert.match(problem(`["${'x'.repeat(20)}"]`, { maxStringLength: 10 }), /a string longer than 10 characters/);
  assert.match(problem(`["${'\\n'.repeat(20)}"]`, { maxStringLength: 10 }), /a string longer than 10 characters/);
  assert.equal(JSON_LIMITS.maxDepth, 32);
});

test('json: a byte order mark is skipped, and __proto__ is an ordinary name', () => {
  assert.deepEqual(parseJson(`${String.fromCharCode(0xfeff)}[1]`).value, [1]);
  const { value } = parseJson('{"__proto__": {"polluted": true}}');
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), ['__proto__']);
  assert.equal({}.polluted, undefined);
  assert.equal(jsonProblem(new Error('plain'), ''), 'plain');
});
