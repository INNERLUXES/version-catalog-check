// A small TOML reader for version catalogs. It reads the part of TOML 1.0 that a catalog uses: comments, key and value
// pairs with bare, quoted and dotted keys, tables such as [libraries], inline tables such as { module = "a:b",
// version.ref = "c" }, arrays that may span lines, basic and literal strings in one line or many, integers, floats and
// booleans. It reads the text once, left to right, with a list of open arrays and inline tables of its own and no
// recursion, so a deep value cannot exhaust the stack. It refuses what it does not read rather than guess: an array of
// tables ([[x]]), a date or a time, a key defined twice and a table defined twice, each with its place. Every value
// keeps the offset where it starts and every key the offset of its name, so a finding can name its line and column.
// Tables are kept in Map objects, so a key such as __proto__ is only a name.

export const TOML_LIMITS = { maxDepth: 16, maxValues: 50000, maxStringLength: 4096, maxKeyParts: 16 };

export class TomlError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

const BARE = /[A-Za-z0-9_-]/;
const NUMBER = /[+-]?(?:inf|nan|0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|[0-9][0-9_]*(?:\.[0-9][0-9_]*)?(?:[eE][+-]?[0-9][0-9_]*)?)/y;
const ESCAPES = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };

// A new table: entries is a Map of key to value; how says how it came to be: 'root', 'header' ([x]), 'implicit' (a
// part of a header such as the a of [a.b]), 'dotted' (a part of a dotted key) or 'inline' ({ ... }).
export const newTable = (offset, how) => ({ kind: 'table', entries: new Map(), offset, how });

// Reads a TOML text. Returns the root table, or throws TomlError with the offset of the problem.
export function parseToml(text, limits = TOML_LIMITS) {
  const lim = { ...TOML_LIMITS, ...limits };
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let values = 0;
  const fail = (reason, at = i) => {
    throw new TomlError(reason, at);
  };

  const skipSpaces = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\t')) i += 1;
  };
  const skipComment = () => {
    if (text[i] !== '#') return;
    while (i < n && text[i] !== '\n' && text[i] !== '\r') {
      const c = text.charCodeAt(i);
      if ((c < 0x20 && c !== 9) || c === 0x7f) fail('a control character in a comment');
      i += 1;
    }
  };
  const atLineEnd = () => i >= n || text[i] === '\n' || (text[i] === '\r' && text[i + 1] === '\n');
  const skipLineEnd = () => {
    if (text[i] === '\r') i += 1;
    if (text[i] === '\n') i += 1;
  };
  // Spaces, line ends and comments, as an array allows between its values.
  const skipBlank = () => {
    for (;;) {
      skipSpaces();
      skipComment();
      if (i < n && atLineEnd()) skipLineEnd();
      else return;
    }
  };

  const readEscape = (start) => {
    const e = text[i + 1];
    if (e === 'u' || e === 'U') {
      const len = e === 'u' ? 4 : 8;
      const hex = text.slice(i + 2, i + 2 + len);
      if (hex.length !== len || !/^[0-9A-Fa-f]+$/.test(hex)) fail(`an escape \\${e} that is not followed by ${len === 4 ? 'four' : 'eight'} hexadecimal digits`, i);
      const code = parseInt(hex, 16);
      if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) fail('an escape that is not a Unicode scalar value', i);
      i += 2 + len;
      return String.fromCodePoint(code);
    }
    if (Object.hasOwn(ESCAPES, e)) {
      i += 2;
      return ESCAPES[e];
    }
    return fail(`an escape \\${(e ?? '').slice(0, 1)} that TOML does not have`, i || start);
  };

  // One string: basic ("..."), literal ('...'), or multi-line ("""...""" and '''...''').
  const readString = () => {
    const start = i;
    const q = text[i];
    const multi = text.startsWith(q.repeat(3), i);
    i += multi ? 3 : 1;
    if (multi) {
      if (text[i] === '\n') i += 1;
      else if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    }
    let out = '';
    for (;;) {
      if (i >= n) fail('a string that is not closed', start);
      if (out.length > lim.maxStringLength) fail(`a string longer than ${lim.maxStringLength} characters`, start);
      const c = text[i];
      if (multi && text.startsWith(q.repeat(3), i)) {
        // Up to two quotes may stand right before the closing three.
        let extra = 0;
        while (extra < 2 && text[i + 3 + extra] === q) extra += 1;
        out += q.repeat(extra);
        i += 3 + extra;
        return out;
      }
      if (!multi && c === q) {
        i += 1;
        return out;
      }
      const code = text.charCodeAt(i);
      if (c === '\n' || c === '\r') {
        if (!multi) fail('a line end inside a string; use a multi-line string with three quotes', start);
        if (c === '\r' && text[i + 1] !== '\n') fail('a carriage return that is not followed by a line feed');
        out += '\n';
        i += c === '\r' ? 2 : 1;
        continue;
      }
      if ((code < 0x20 && code !== 9) || code === 0x7f) fail('a control character inside a string; write it as an escape such as \\n');
      if (c === '\\' && q === '"') {
        if (multi) {
          // A backslash at the end of a line trims the line end and the white space after it.
          let j = i + 1;
          while (text[j] === ' ' || text[j] === '\t') j += 1;
          if (text[j] === '\n' || (text[j] === '\r' && text[j + 1] === '\n')) {
            i = j;
            while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i += 1;
            continue;
          }
        }
        out += readEscape(start);
        continue;
      }
      out += c;
      i += 1;
    }
  };

  // A key: bare or quoted parts separated by dots. Returns { parts, offsets }.
  const readKey = () => {
    const parts = [];
    const offsets = [];
    for (;;) {
      skipSpaces();
      const at = i;
      if (text[i] === '"' || text[i] === "'") {
        if (text.startsWith(text[i].repeat(3), i)) fail('a multi-line string cannot be a key');
        parts.push(readString());
      } else {
        while (i < n && BARE.test(text[i])) i += 1;
        if (i === at) fail(i >= n || atLineEnd() ? 'a key was expected before the end of the line' : `the character ${JSON.stringify(text[i])} where a key was expected`);
        parts.push(text.slice(at, i));
      }
      offsets.push(at);
      if (parts.length > lim.maxKeyParts) fail(`a key of more than ${lim.maxKeyParts} parts`, at);
      skipSpaces();
      if (text[i] !== '.') return { parts, offsets };
      i += 1;
    }
  };

  const shown = (parts) => parts.join('.');

  // The table a dotted key leads to inside a table, made where it is missing.
  const descend = (table, parts, offsets, upTo) => {
    let t = table;
    for (let p = 0; p < upTo; p += 1) {
      const existing = t.entries.get(parts[p]);
      if (existing === undefined) {
        const made = newTable(offsets[p], 'dotted');
        made.keyOffset = offsets[p];
        t.entries.set(parts[p], made);
        t = made;
      } else if (existing.kind !== 'table' || existing.how === 'inline' || existing.how === 'header' || existing.how === 'implicit') {
        fail(`the key ${shown(parts.slice(0, p + 1))} is already defined, so it cannot be extended here`, offsets[p]);
      } else t = existing;
    }
    return t;
  };

  const assign = (table, key, value) => {
    const t = descend(table, key.parts, key.offsets, key.parts.length - 1);
    const last = key.parts.at(-1);
    if (t.entries.has(last)) fail(`the key ${shown(key.parts)} is defined twice`, key.offsets.at(-1));
    value.keyOffset = key.offsets.at(-1);
    t.entries.set(last, value);
  };

  const readScalar = () => {
    const at = i;
    values += 1;
    if (values > lim.maxValues) fail(`more than ${lim.maxValues} values`);
    const c = text[i];
    if (c === '"' || c === "'") return { kind: 'string', value: readString(), offset: at };
    if (text.startsWith('true', i) && !BARE.test(text[i + 4] ?? '')) {
      i += 4;
      return { kind: 'boolean', value: true, offset: at };
    }
    if (text.startsWith('false', i) && !BARE.test(text[i + 5] ?? '')) {
      i += 5;
      return { kind: 'boolean', value: false, offset: at };
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (m && m[0].length > 0) {
      const after = text[i + m[0].length];
      if (after === '-' || after === ':') fail('a date or a time, which a version catalog does not use; write the version as a string in quotes');
      if (after !== undefined && (BARE.test(after) || after === '.')) fail(`a value that is not a string, a number or a boolean; a version is written in quotes, such as "1.2.0"`);
      i += m[0].length;
      const isFloat = /[.eE]|inf|nan/.test(m[0]) && !/^[+-]?0[xob]/.test(m[0]);
      return { kind: isFloat ? 'float' : 'integer', value: m[0], offset: at };
    }
    if (i >= n || atLineEnd()) return fail('a value was expected before the end of the line');
    return fail(`the character ${JSON.stringify(c)} where a value was expected; a version is written in quotes, such as "1.2.0"`);
  };

  // One value, which may hold arrays and inline tables, read with a list of open containers and no recursion.
  const readValue = () => {
    const frames = [];
    let pending = null;
    for (;;) {
      if (pending === null) {
        const top = frames.at(-1);
        if (top && top.kind === 'array') skipBlank();
        else skipSpaces();
        if (top && top.kind === 'array' && text[i] === ']') {
          i += 1;
          pending = frames.pop().node;
          continue;
        }
        if (text[i] === '[' || text[i] === '{') {
          if (frames.length >= lim.maxDepth) fail(`values nested more than ${lim.maxDepth} deep`);
          values += 1;
          if (values > lim.maxValues) fail(`more than ${lim.maxValues} values`);
          if (text[i] === '[') {
            frames.push({ kind: 'array', node: { kind: 'array', items: [], offset: i } });
            i += 1;
            continue;
          }
          const node = newTable(i, 'inline');
          i += 1;
          skipSpaces();
          if (text[i] === '}') {
            i += 1;
            pending = node;
            continue;
          }
          const key = readKey();
          if (text[i] !== '=') fail('an equals sign after the key was expected');
          i += 1;
          frames.push({ kind: 'inline', node, key });
          continue;
        }
        pending = readScalar();
      }
      const top = frames.at(-1);
      if (!top) return pending;
      if (top.kind === 'array') {
        top.node.items.push(pending);
        pending = null;
        skipBlank();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === ']') {
          i += 1;
          pending = frames.pop().node;
          continue;
        }
        fail('a comma or a closing bracket was expected');
      }
      assign(top.node, top.key, pending);
      pending = null;
      skipSpaces();
      if (text[i] === ',') {
        i += 1;
        skipSpaces();
        if (text[i] === '}') fail('a comma before the closing brace; an inline table has no trailing comma');
        if (i >= n || atLineEnd() || text[i] === '#') fail('an inline table that does not close on its line; TOML writes an inline table on one line');
        top.key = readKey();
        if (text[i] !== '=') fail('an equals sign after the key was expected');
        i += 1;
        continue;
      }
      if (text[i] === '}') {
        i += 1;
        pending = frames.pop().node;
        continue;
      }
      fail(i >= n || atLineEnd() ? 'an inline table that does not close on its line; TOML writes an inline table on one line' : 'a comma or a closing brace was expected');
    }
  };

  const root = newTable(0, 'root');
  let current = root;
  for (;;) {
    skipBlank();
    if (i >= n) return root;
    if (text[i] === '[') {
      const at = i;
      if (text[i + 1] === '[') fail('an array of tables ([[...]]), which a version catalog does not use');
      i += 1;
      const key = readKey();
      if (text[i] !== ']') fail('a closing bracket after the table name was expected');
      i += 1;
      let t = root;
      for (let p = 0; p < key.parts.length; p += 1) {
        const name = key.parts[p];
        const existing = t.entries.get(name);
        const last = p === key.parts.length - 1;
        if (existing === undefined) {
          const made = newTable(at, last ? 'header' : 'implicit');
          made.keyOffset = key.offsets[p];
          t.entries.set(name, made);
          t = made;
        } else if (existing.kind !== 'table' || existing.how === 'inline') {
          fail(`the key ${shown(key.parts.slice(0, p + 1))} is already a value, so it cannot be a table`, key.offsets[p]);
        } else if (last) {
          if (existing.how !== 'implicit') fail(`the table [${shown(key.parts)}] is defined twice`, at);
          existing.how = 'header';
          existing.offset = at;
          t = existing;
        } else t = existing;
      }
      current = t;
    } else {
      const key = readKey();
      if (text[i] !== '=') fail('an equals sign after the key was expected');
      i += 1;
      skipSpaces();
      const value = readValue();
      assign(current, key, value);
    }
    skipSpaces();
    skipComment();
    if (!atLineEnd()) fail('a line end after the value was expected; write one key and value a line');
  }
}

// The value of a key in a table, or undefined.
export const entryOf = (table, key) => (table && table.kind === 'table' ? table.entries.get(key) : undefined);
