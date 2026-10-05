import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_LIMITS, CATALOG_TABLES, accessorOf, catalogNameOf, parseToml, readCatalog, splitModule } from '../src/index.js';
import { CATALOG, catalogOf, edit } from './helpers.js';

// The catalog read from its TOML tables: every form of a library, a plugin, a version and a bundle that the Gradle page
// on version catalogs describes, and the entries Gradle could not read, each with a near miss.

const rules = (text) => catalogOf(text).findings.map((f) => f.rule);
const found = (text) => catalogOf(text).findings.map((f) => f.found).join('\n');

test('catalog: the good catalog has its versions, libraries, bundles and plugins and no finding', () => {
  const c = catalogOf(CATALOG);
  assert.deepEqual(c.findings, []);
  assert.deepEqual(c.versions.map((v) => v.key), ['kotlin', 'coreKtx', 'composeBom', 'room']);
  assert.deepEqual(c.libraries.map((l) => l.accessor), ['androidx.core.ktx', 'compose.bom', 'compose.ui', 'room.runtime', 'room.compiler']);
  assert.deepEqual(c.bundles.map((b) => [b.accessor, b.members.map((m) => m.alias)]), [['room', ['room-runtime']]]);
  assert.deepEqual(c.plugins.map((p) => [p.accessor, p.id, p.text]), [['kotlin.android', 'org.jetbrains.kotlin.android', '2.0.21']]);
  const core = c.libraries[0];
  assert.deepEqual([core.module, core.version.kind, core.version.ref, core.text], [{ group: 'androidx.core', name: 'core-ktx' }, 'ref', 'coreKtx', '1.13.1']);
  assert.equal(c.libraries[2].version, null, 'a library with no version, for a BOM');
  assert.equal(c.libraries[2].text, null);
});

test('catalog: every form of a library: one string, module, group and name, a dotted table, a plain and a rich version', () => {
  const c = catalogOf('[versions]\nv = { strictly = "[1.0,2.0[", prefer = "1.4" }\n[libraries]\na = "g.a:n-a:1.0"\nb = "g.b:n-b"\nc = { module = "g.c:n-c", version = "2.0" }\nd = { group = "g.d", name = "n-d", version = { require = "1.1", reject = ["1.2"] } }\ne.module = "g.e:n-e"\ne.version.ref = "v"\n[libraries.f]\nmodule = "g.f:n-f"\n');
  assert.deepEqual(c.findings, []);
  const by = Object.fromEntries(c.libraries.map((l) => [l.alias, l]));
  assert.deepEqual([by.a.module, by.a.version.text], [{ group: 'g.a', name: 'n-a' }, '1.0']);
  assert.equal(by.b.version, null);
  assert.equal(by.c.text, '2.0');
  assert.deepEqual([by.d.version.kind, by.d.version.rich, by.d.text], ['rich', { require: '1.1', reject: ['1.2'] }, '1.1']);
  assert.deepEqual([by.e.version.kind, by.e.text], ['ref', '[1.0,2.0['], 'a ref to a rich version stands for its strictly');
  assert.deepEqual(by.f.module, { group: 'g.f', name: 'n-f' });
  assert.deepEqual(c.versions[0].version.rich, { strictly: '[1.0,2.0[', prefer: '1.4' });
});

test('catalog: the forms of a plugin, and the offset of a version inside a string', () => {
  const text = '[plugins]\na = "com.x.a:1.2"\nb = { id = "com.x.b", version = "3.0" }\nc = { id = "com.x.c" }\n';
  const c = catalogOf(text);
  assert.deepEqual(c.findings, []);
  assert.deepEqual(c.plugins.map((p) => [p.id, p.text]), [['com.x.a', '1.2'], ['com.x.b', '3.0'], ['com.x.c', null]]);
  assert.equal(text.slice(c.plugins[0].version.offset, c.plugins[0].version.offset + 3), '1.2');
  const lib = catalogOf('[libraries]\nx = "g:n:4.+"\n').libraries[0];
  assert.equal('[libraries]\nx = "g:n:4.+"\n'.slice(lib.version.offset, lib.version.offset + 3), '4.+');
});

test('catalog: a version.ref to a key that is not there is missing-version-ref; one that is there is not', () => {
  const missing = catalogOf(edit(CATALOG, ['version.ref = "room" }\nroom-compiler', 'version.ref = "rooms" }\nroom-compiler']));
  assert.deepEqual(missing.findings.map((f) => f.rule), ['missing-version-ref']);
  assert.match(missing.findings[0].found, /the library "room-runtime" has version.ref = "rooms", but \[versions\] has no key rooms/);
  assert.deepEqual(rules('[plugins]\np = { id = "a.b", version.ref = "x" }\n'), ['missing-version-ref']);
  assert.match(found('[plugins]\np = { id = "a.b", version.ref = "x" }\n'), /the plugin "p"/);
  assert.deepEqual(rules('[versions]\nx = "1"\n[plugins]\np = { id = "a.b", version.ref = "x" }\n'), []);
});

test('catalog: entries Gradle cannot read are invalid-catalog-entry, each with what is wrong', () => {
  for (const [text, reason] of [
    ['[librarys]\n', /"librarys" is not a table Gradle reads/],
    ['versions = "1"\n', /versions is a string, not a table/],
    ['[libraries]\na = "g:n:v:x"\n', /not group:name or group:name:version/],
    ['[libraries]\na = "g n:x"\n', /a group or a name with a character Gradle does not take/],
    ['[libraries]\na = "g:n:"\n', /ends with a colon and no version/],
    ['[libraries]\na = { version = "1" }\n', /has no module and no group and name/],
    ['[libraries]\na = { module = "g:n", group = "g" }\n', /has module and also group or name/],
    ['[libraries]\na = { module = "g" }\n', /has a module that is not "group:name"/],
    ['[libraries]\na = { group = "g", name = "n m" }\n', /has a name that is not an artifact name/],
    ['[libraries]\na = { group = "g g", name = "n" }\n', /has a group that is not a group name/],
    ['[libraries]\na = { module = "g:n", vers = "1" }\n', /"vers", which is not module, group, name or version/],
    ['[libraries]\na = 3\n', /is an integer, not "group:name:version"/],
    ['[libraries]\na = { module = "g:n", version = "" }\n', /has an empty version/],
    ['[libraries]\na = { module = "g:n", version = 1 }\n', /a version that is an integer/],
    ['[libraries]\na = { module = "g:n", version = { ref = "x", strictly = "1" } }\n[versions]\nx = "1"\n', /has version.ref and also version.strictly/],
    ['[libraries]\na = { module = "g:n", version = { ref = 3 } }\n', /a version.ref that is an integer/],
    ['[libraries]\na = { module = "g:n", version = { strict = "1" } }\n', /"strict" in its version, which is not one of ref, strictly/],
    ['[libraries]\na = { module = "g:n", version = { reject = "1" } }\n', /a reject that is not a list/],
    ['[libraries]\na = { module = "g:n", version = { rejectAll = "yes" } }\n', /a rejectAll that is not true or false/],
    ['[libraries]\na = { module = "g:n", version = { prefer = 2 } }\n', /a prefer that is not a version in quotes/],
    ['[libraries]\na = { module = "g:n", version = { rejectAll = false } }\n', /a version table with no version in it/],
    ['[versions]\nv = { ref = "x" }\n', /uses ref inside \[versions\]/],
    ['[plugins]\np = "nocolon"\n', /not id:version/],
    ['[plugins]\np = { version = "1" }\n', /has no id that Gradle can read/],
    ['[plugins]\np = { id = "a", vers = "1" }\n', /"vers", which is not id or version/],
    ['[plugins]\np = true\n', /is a boolean, not "id:version"/],
    ['[bundles]\nb = "x"\n', /is a string, not a list of library aliases/],
    ['[bundles]\nb = ["nope"]\n', /names "nope", which is not a library of this catalog/],
    ['[bundles]\nb = [1]\n', /holds an integer, not the alias of a library/],
    ['[libraries]\na-b = "g:n:1"\na_b = "g:m:1"\n', /gives the same accessor a.b as "a-b"/],
    ['[libraries]\n"-" = "g:n:1"\n', /has no letters or digits/]
  ]) {
    const c = catalogOf(text);
    assert.ok(c.findings.some((f) => f.rule === 'invalid-catalog-entry'), text);
    assert.match(c.findings.map((f) => f.found).join('\n'), reason, text);
  }
  assert.deepEqual(rules('[metadata]\nformat.version = "1.1"\n'), [], 'the metadata table is read by Gradle and passed over');
  assert.deepEqual(rules('[bundles]\nb = ["a_b"]\n[libraries]\na-b = "g:n:1"\n'), [], 'a bundle member is found by its accessor');
});

test('catalog: the accessor and the name of a catalog, and the coordinates', () => {
  assert.equal(accessorOf('androidx-core_ktx'), 'androidx.core.ktx');
  assert.equal(accessorOf('androidx.core.ktx'), 'androidx.core.ktx');
  assert.equal(accessorOf('kotlinxCoroutines'), 'kotlinxCoroutines');
  assert.equal(accessorOf('a--b'), 'a.b');
  assert.equal(catalogNameOf('gradle/libs.versions.toml'), 'libs');
  assert.equal(catalogNameOf('deps.toml'), 'deps');
  assert.equal(catalogNameOf('tools/x.versions.toml'), 'x');
  assert.equal(catalogNameOf('.versions.toml'), '.versions');
  assert.equal(catalogNameOf('plain'), 'plain');
  assert.deepEqual(splitModule('a.b:c-d'), { group: 'a.b', name: 'c-d' });
  assert.equal(splitModule('a:b:c'), null);
  assert.equal(splitModule(':b'), null);
  assert.deepEqual(CATALOG_TABLES, ['versions', 'libraries', 'bundles', 'plugins']);
});

test('catalog: the limit of entries is kept and said', () => {
  const text = `[libraries]\n${Array.from({ length: 30 }, (_, i) => `l${i} = "g:n${i}:1"`).join('\n')}\n`;
  const c = readCatalog(parseToml(text), { limits: { maxCatalogEntries: 10 } });
  assert.equal(c.libraries.length, 10);
  assert.equal(c.limited, true);
  assert.equal(catalogOf(text).limited, false);
  assert.equal(CATALOG_LIMITS.maxCatalogEntries, 5000);
});
