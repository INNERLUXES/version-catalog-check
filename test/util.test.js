import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { DEFAULT_CATALOG, FILE_LIMITS, LIMITS, MAX_PATTERN_LENGTH, MAX_VERSION_LENGTH, OPEN_FLAGS, RULES, SKIPPED_FOLDERS, WALK_LIMITS, asciiLower, atOrAbove, baseName, byCode, capped, checkProject, coordinateMatch, decide, defaultConfig, displayPath, dynamicReason, excluded, fileError, flat, folderOf, globMatch, grouped, inside, inspectPath, isGradleName, isInterpolated, isSettingsName, joinPath, levelOf, listText, placer, plural, readBounded, readCatalogFile, readText, readTextFile, richParts, richText, ruleById, safeText, textOf, walkProject } from '../src/index.js';
import { CATALOG, PROJECT, withFiles } from './helpers.js';

test('versions: dynamic and open versions, and the ones that name one version', () => {
  for (const v of ['+', '1.+', '1.3.+', 'latest.release', 'latest.integration', '[1.0,2.0)', '[1.0,)', '(,2.0]', ']1.0,2.0[', '[1.1, 2.0)']) assert.ok(dynamicReason(v), v);
  for (const v of ['1.0', '1.0.0-beta01', '2.71828', '1.0+beta', '[1.0]', '', null, 'latest', '1.0-SNAPSHOT']) assert.equal(dynamicReason(v), null, String(v));
  assert.match(dynamicReason('+'), /the version \+ takes the newest version there is/);
  assert.ok(isInterpolated('$kotlin') && isInterpolated('${v}') && !isInterpolated('1.0') && !isInterpolated(null));
  assert.equal(richText({ strictly: '1', require: '2' }), '1');
  assert.equal(richText({ require: '2', prefer: '3' }), '2');
  assert.equal(richText({ prefer: '3' }), '3');
  assert.equal(richText({ reject: ['1'] }), null);
  assert.equal(richText(null), null);
  assert.deepEqual(richParts({ prefer: '1', strictly: '2', reject: ['3'] }), [{ part: 'strictly', text: '2' }, { part: 'prefer', text: '1' }]);
  assert.deepEqual(richParts(null), []);
  assert.equal(MAX_VERSION_LENGTH, 128);
});

test('glob: path patterns with *, ?, ** and **/, and coordinate patterns per part', () => {
  for (const [p, t] of [['legacy/**', 'legacy/a/b.gradle'], ['legacy/**', 'legacy/'], ['**/samples/**', 'x/samples/build.gradle'], ['**/samples/**', 'samples/a'], ['*.gradle', 'build.gradle'], ['a?c', 'abc'], ['**', 'a/b/c'], ['**/build.gradle', 'build.gradle'], ['a/**/b', 'a/b'], ['a/**/b', 'a/x/y/b']]) assert.ok(globMatch(p, t), `${p} ${t}`);
  for (const [p, t] of [['legacy/**', 'legacy'], ['*.gradle', 'a/build.gradle'], ['a?c', 'a/c'], ['a', 'ab'], ['ab', 'a'], ['**/x', 'ax']]) assert.ok(!globMatch(p, t), `${p} ${t}`);
  assert.ok(excluded(['legacy/**'], 'legacy', true) && !excluded(['legacy/**'], 'legacy', false) && !excluded([], 'x'));
  assert.ok(coordinateMatch('androidx.compose.*:*', 'androidx.compose.ui', 'ui'));
  assert.ok(!coordinateMatch('androidx.compose.*:*', 'androidx.compose', 'compose-bom'));
  assert.ok(coordinateMatch('com.google.firebase:*-gradle', 'com.google.firebase', 'firebase-crashlytics-gradle'));
  assert.ok(coordinateMatch('org.jetbrains.kotlinx:kotlinx-coroutines-*', 'org.jetbrains.kotlinx', 'kotlinx-coroutines-core'));
  assert.ok(!coordinateMatch('nocolon', 'a', 'b'));
  assert.equal(MAX_PATTERN_LENGTH, 200);
});

test('words, sizes and text: ASCII lowercase, paths, lists, plurals and cleaned text', () => {
  assert.equal(asciiLower('Build.GRADLE.kts'), 'build.gradle.kts');
  assert.equal(baseName('app/build.gradle.kts'), 'build.gradle.kts');
  assert.equal(folderOf('app/build.gradle'), 'app');
  assert.equal(folderOf('build.gradle'), '.');
  assert.equal(joinPath('.', 'a'), 'a');
  assert.equal(joinPath('a', ''), 'a');
  assert.equal(byCode('B', 'a'), -1);
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(plural(1, 'library', 'libraries'), '1 library');
  assert.equal(plural(2, 'library', 'libraries'), '2 libraries');
  assert.equal(safeText('a\u0007b\u202ec\u2028d', 100), 'a b c d');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n b '), 'a b');
});

test('rules: the levels, the result and the input problems', () => {
  assert.ok(atOrAbove('error', 'warning'));
  assert.ok(!atOrAbove('info', 'warning'));
  assert.equal(ruleById('dynamic-version').key, 'dynamicVersion');
  assert.equal(levelOf(ruleById('unreadable-file'), defaultConfig()), 'error');
  assert.deepEqual(decide([{ level: 'warning' }], 'error'), { pass: true, failOn: 'error', failing: 0, byLevel: { error: 0, warning: 1, info: 0 }, text: 'PASS - no finding at or above error (1 warning)' });
  assert.equal(decide([{ level: 'error' }, { level: 'error' }], 'error').text, 'FAIL - 2 findings at or above error (2 error)');
  assert.equal(capped(Array.from({ length: 25 }, (_, i) => `p${i}`)).at(-1), 'and 5 more');
  assert.equal(RULES.filter((r) => r.key === null).length, 2);
  assert.equal(RULES.length, 15);
});

test('files: bounded reading, UTF-8 and UTF-16 by the byte order mark, and paths as shown', async () => {
  const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('a = 1', 'utf16le')]);
  const utf16be = Buffer.from(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('a = 1', 'utf16le')]).map((b, i, all) => (i < 2 ? b : all[i % 2 === 0 ? i + 1 : i - 1])));
  await withFiles({ 'a/x.gradle': 'x\n', 'a/big.bin': Buffer.alloc(3000, 1), 'a/latin.toml': Buffer.from([0x61, 0xe9]), 'a/le.toml': utf16le }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a/x.gradle'), 100)).toString(), 'x\n');
    await assert.rejects(readBounded(resolve(dir, 'a/big.bin'), 100), /3,000 bytes is over the 100 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'a'), 100), /is a folder/);
    await assert.rejects(readBounded(resolve(dir, 'none'), 100), /no such file/);
    assert.deepEqual(await readText(resolve(dir, 'a/le.toml'), 'a/le.toml', 100), { size: 12, text: 'a = 1', encoding: 'utf-16le' });
    assert.equal(displayPath(resolve(dir, 'a/x.gradle'), dir), 'a/x.gradle');
    assert.equal(displayPath(dir, dir), '.');
    assert.ok(!displayPath(resolve(dir, '..', 'x'), dir).startsWith('..'));
    assert.equal((await inspectPath('a', dir)).folder, true);
    await assert.rejects(inspectPath('none', dir), /no such file or folder/);
    await assert.rejects(readTextFile('a', dir, 100), /is a folder; give the file itself/);
    const r = await readCatalogFile(resolve(dir, 'a/latin.toml'), 'a/latin.toml', 'libs');
    assert.equal(r.model, null);
    assert.match(r.problem.found, /not valid UTF-8/);
    const le = await readCatalogFile(resolve(dir, 'a/le.toml'), 'a/le.toml', 'libs');
    assert.match(le.model.findings[0].found, /"a" is not a table Gradle reads/, 'a UTF-16 catalog is read');
  });
  assert.deepEqual(textOf(Buffer.from('\ufeffx'), 'f'), { text: 'x', encoding: 'utf-8' });
  assert.deepEqual(textOf(utf16be, 'f'), { text: 'a = 1', encoding: 'utf-16be' });
  assert.throws(() => textOf(Buffer.from([0xff]), 'f'), /not valid UTF-8/);
  assert.throws(() => textOf(Buffer.from('<a/>', 'utf16le'), 'f'), /a null byte\); a UTF-16 file needs its byte order mark/);
  assert.throws(() => textOf(Buffer.from([0xff, 0xfe, 0x41]), 'f'), /odd number of bytes/);
  assert.throws(() => textOf(Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00]), 'f'), /not valid UTF-16/);
  assert.throws(() => textOf(Buffer.from([0xff, 0xfe, 0x00, 0x00]), 'f'), /a null character/);
  assert.equal(fileError('p', 'r').reason, 'r');
  assert.equal(typeof OPEN_FLAGS, 'number');
  assert.equal(FILE_LIMITS.maxFileBytes, 1024 * 1024);
});

test('walk: the Gradle files below a folder in the order of their paths, with build, .gradle and .git passed over', async () => {
  await withFiles({ 'r/settings.gradle.kts': 'x', 'r/b/build.gradle': 'x', 'r/a/build.gradle.kts': 'x', 'r/a/conv.GRADLE': 'x', 'r/notes.txt': 'x', 'r/build/x.gradle': 'x', 'r/.gradle/y.gradle': 'x', 'r/.git/z.gradle': 'x', 'r/skip/w.gradle': 'x' }, async (dir) => {
    const w = await walkProject(resolve(dir, 'r'), { exclude: ['skip/**'] });
    assert.deepEqual(w.files.map((f) => f.rel), ['a/build.gradle.kts', 'a/conv.GRADLE', 'b/build.gradle', 'settings.gradle.kts']);
    assert.deepEqual([w.skipped, w.excluded, w.links, w.others, w.limit], [3, 1, 0, 1, null]);
    assert.match((await walkProject(resolve(dir, 'r'), { limits: { maxGradleFiles: 2 } })).limit, /more than 2 Gradle files/);
  });
  for (const [n, ok] of [['build.gradle', true], ['build.gradle.kts', true], ['libs.GRADLE', true], ['.gradle', false], ['.gradle.kts', false], ['build.gradle.bak', false], ['gradle.properties', false]]) assert.equal(isGradleName(n), ok, n);
  assert.ok(isSettingsName('Settings.gradle') && isSettingsName('settings.gradle.kts') && !isSettingsName('settings.txt'));
  assert.deepEqual(SKIPPED_FOLDERS, ['build', '.gradle', '.git']);
  assert.equal(WALK_LIMITS.maxProjectEntries, 50000);
});

test('check: checkProject builds the report of a run without the command line, and the pieces it uses', async () => {
  await withFiles(PROJECT, async (dir) => {
    const r = await checkProject({ project: 'p', base: dir, version: '9.9.9' });
    assert.equal(r.version, '9.9.9');
    assert.equal(r.result.pass, true);
    assert.equal(r.input.gradleFiles, 2);
    assert.equal(r.catalogs[0].file, 'p/gradle/libs.versions.toml');
    assert.ok(inside(resolve(dir, 'p'), resolve(dir, 'p/gradle/x.toml')));
    assert.ok(inside(resolve(dir, 'p'), resolve(dir, 'p')));
    assert.ok(!inside(resolve(dir, 'p'), resolve(dir, 'q.toml')));
  });
  const place = placer('a\nbc\r\nd');
  assert.deepEqual(place(3), { line: 2, column: 2 });
  assert.deepEqual(place(99), { line: 3, column: 2 });
  assert.equal(DEFAULT_CATALOG, 'gradle/libs.versions.toml');
  assert.equal(LIMITS.maxCatalogs, 20);
  assert.ok(CATALOG.includes('[versions]'));
});
