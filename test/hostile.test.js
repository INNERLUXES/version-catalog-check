import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, MAX_PROBLEMS, globMatch, maskCode, parseJson, parseToml, scanGradle } from '../src/index.js';
import { B, BUILD, CATALOG, PROJECT, S, T, cli, edit, projectWith, run, withFiles } from './helpers.js';

// Hostile input: catalogs, Gradle files and folders built to exhaust the memory, the stack or the time, to make the
// tool follow a link out of the project, to rewrite the terminal, to start a second workflow command, to slip a formula
// into a spreadsheet or to change how objects behave. Each heavy test also checks the time, because work that grows
// faster than the input is a failure even when the answer is right. Tests that need a symbolic link, a device or file
// permissions are guarded with process.platform, and none of them asserts a line: lines are asserted in the tests that
// run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};
const refused = (fn) => {
  try {
    fn();
  } catch {
    // refused input is fine; the time is what is checked
  }
};

test('hostile: a catalog of thousands of entries and a build file of thousands of references are read in one pass', LIMIT, async () => {
  const libs = Array.from({ length: 4000 }, (_, i) => `l${i} = { module = "g${i}:n${i}", version.ref = "v" }`).join('\n');
  const catalog = `[versions]\nv = "1.0"\n[libraries]\n${libs}\n`;
  const build = `dependencies {\n${Array.from({ length: 4000 }, (_, i) => `    implementation(libs.l${i})`).join('\n')}\n}\n`;
  const r = await fast(() => run(projectWith({ [T]: catalog, [B]: build }), ['p', '--json']), 20000);
  const out = JSON.parse(r.out);
  assert.equal(out.summary.libraries, 4000);
  assert.equal(out.summary.catalogReferences, 4000);
  assert.deepEqual(out.findings, []);
  const capped = JSON.parse((await run(projectWith({ [T]: catalog }), ['p', '--json'], { maxCatalogEntries: 100 })).out);
  assert.ok(capped.findings.some((f) => f.rule === 'scan-limit' && /more than 100 entries/.test(f.found)));
  const many = JSON.parse((await fast(() => run(projectWith({ [T]: catalog, [B]: BUILD }), ['p', '--json']), 20000)).out);
  assert.equal(many.findings.length, LIMITS.maxFindingsPerRule);
  assert.equal(many.totals.notListed, 4000 - LIMITS.maxFindingsPerRule);
});

test('hostile: TOML with long runs of brackets, braces, quotes, escapes and dots is read or refused in one pass', LIMIT, async () => {
  for (const text of ['['.repeat(200000), `a = ${'['.repeat(200000)}`, `a = ${'{ b = '.repeat(50000)}`, `a = "${'\\'.repeat(200000)}`, '"'.repeat(200000), `a = """${'"'.repeat(200000)}`, `${'a.'.repeat(100000)}b = 1`, `a = [${'"x",'.repeat(100000)}]`, '#'.repeat(400000), `${'\n'.repeat(200000)}a = 1`, `a = '''${"'".repeat(200000)}`]) {
    await fast(() => refused(() => parseToml(text)));
  }
  assert.throws(() => parseToml(`a = ${'['.repeat(5000)}${']'.repeat(5000)}`), /nested more than 16 deep/);
});

test('hostile: Gradle text with long runs of quotes, comments, templates, references and braces is read in one pass', LIMIT, async () => {
  for (const text of ['"'.repeat(300000), "'".repeat(300000), '/*'.repeat(200000), '//'.repeat(200000), `"${'${'.repeat(100000)}`, 'libs.'.repeat(100000), `implementation(${'('.repeat(100000)}"a:b:1")`, `versionCatalogs {${'{'.repeat(50000)}${'"x" '.repeat(50000)}`, `${'versionCatalogs { a { from(files("x")) } }\n'.repeat(5000)}`, `libs${'.a'.repeat(100000)}`, 'jcenter() '.repeat(50000)]) {
    await fast(() => scanGradle(text, { settings: true, catalogNames: ['libs'] }));
  }
  assert.ok(maskCode('"x" '.repeat(200000), { maxStrings: 10 }).strings.length === 10);
});

test('hostile: path and coordinate patterns are matched in time bounded by their length', LIMIT, async () => {
  const path = `${'a/'.repeat(500)}b`;
  await fast(() => {
    for (let i = 0; i < 200; i += 1) globMatch(`${'*'.repeat(100)}**${'?*'.repeat(50)}c`, path);
  });
  assert.equal(globMatch('**/b', path), true);
  assert.equal(globMatch('*/b', path), false);
});

test('hostile: thousands of folders and Gradle files are listed in seconds, and the limits of a project hold', LIMIT, async () => {
  const files = { ...PROJECT };
  for (let i = 0; i < 300; i += 1) files[`p/m${i}/build.gradle`] = 'dependencies { implementation(libs.compose.ui) }\n';
  const r = await fast(() => run(files, ['p', '--json']), 60000);
  assert.equal(JSON.parse(r.out).input.gradleFiles, 302);
  const capped = JSON.parse((await run(files, ['p', '--json'], { maxGradleFiles: 10 })).out);
  assert.match(capped.findings.find((f) => f.rule === 'scan-limit').found, /the project holds more than 10 Gradle files/);
  assert.equal(capped.result.pass, false);
  const entries = JSON.parse((await run(files, ['p', '--json'], { maxProjectEntries: 5 })).out);
  assert.match(entries.findings.find((f) => f.rule === 'scan-limit').found, /more than 5 files and folders/);
  const deep = { ...PROJECT, [`p/${'d/'.repeat(40)}build.gradle`]: 'x' };
  const depth = JSON.parse((await run(deep, ['p', '--json'])).out);
  assert.match(depth.findings.find((f) => f.rule === 'scan-limit').found, /folders nested more than 32 deep/);
  const catalogs = { ...PROJECT };
  const args = ['p'];
  for (let i = 0; i < 3; i += 1) {
    catalogs[`c${i}.versions.toml`] = '[versions]\n';
    args.push('--catalog', `c${i}.versions.toml`);
  }
  const tooMany = JSON.parse((await run(catalogs, [...args, '--json'], { maxCatalogs: 2 })).out);
  assert.match(tooMany.findings.find((f) => f.rule === 'scan-limit').found, /more than 2 catalogs are named/);
});

test('hostile: a file over its size limit is an unreadable-file error, and a configuration over its limit stops the run', LIMIT, async () => {
  const big = await run(projectWith({ [B]: `// ${'x'.repeat(LIMITS.maxFileBytes)}\n` }), ['p', '--json']);
  assert.match(JSON.parse(big.out).findings[0].found, /bytes is over the 1 MB limit/);
  const config = await run({ ...PROJECT, 'c.json': ' '.repeat(LIMITS.maxConfigBytes + 1) }, ['p', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const many = await run({ ...PROJECT, 'c.json': JSON.stringify(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 1]))) }, ['p', '--config', 'c.json']);
  assert.match(many.err, /\n {2}and 10 more\n$/);
  assert.equal(many.err.split('\n').filter((l) => l.startsWith('  c.json')).length, MAX_PROBLEMS);
  assert.throws(() => parseJson(`${'['.repeat(100000)}${']'.repeat(100000)}`, { maxDepth: 32 }), /nested more than 32 deep/);
});

test('hostile: long values and long paths are capped in the messages', LIMIT, async () => {
  const long = 'x'.repeat(3000);
  const r = await fast(() => run(projectWith({ [T]: edit(CATALOG, ['coreKtx = "1.13.1"', `coreKtx = "${long}+"`], ['androidx-core-ktx =', `${long} =`]), [B]: edit(BUILD, ['dependencies {\n', `dependencies {\n    implementation("a:b:${long}")\n`]) }), ['p', '--json']));
  const out = JSON.parse(r.out);
  assert.ok(out.findings.length >= 2);
  assert.ok(out.findings.every((f) => f.found.length <= 800));
  assert.ok(out.findings.some((f) => f.rule === 'dynamic-version'));
});

test('hostile: control, escape, direction and line separator characters in values are removed from every format', async () => {
  const evil = '1.0\\u001b[31m\\u202e\\u2028x+';
  const files = projectWith({ [T]: edit(CATALOG, ['coreKtx = "1.13.1"', `coreKtx = "${evil}"`]) });
  for (const format of ['text', 'json', 'csv', 'github']) {
    const r = await run(files, ['p', '--format', format]);
    assert.equal(r.code, 1);
    for (const c of ['\u001b', '\u202e', '\u2028']) assert.ok(!r.out.includes(c) && !JSON.stringify(JSON.parse(format === 'json' ? r.out : '{}')).includes(c), `${format}: ${JSON.stringify(c)}`);
  }
});

test('hostile: a value cannot end a workflow command or start another one, and a formula is neutralized in CSV', async () => {
  const files = projectWith({ [T]: edit(CATALOG, ['coreKtx = "1.13.1"', 'coreKtx = "%0A::error file=x::y\\n::warning::z+"']) });
  const github = await run(files, ['p', '--format', 'github']);
  const lines = github.out.trimEnd().split('\n');
  assert.ok(lines.slice(0, -1).every((l) => /^::(?:error|warning|notice) file=/.test(l)), github.out);
  assert.ok(github.out.includes('%250A::error file=x::y ::warning::z+'));
  const csv = await run(projectWith({ [T]: edit(CATALOG, ['coreKtx = "1.13.1"', 'coreKtx = "=cmd|calc+"']) }), ['p', '--format', 'csv']);
  assert.ok(csv.out.split('\r\n').slice(1, -1).every((l) => !/,[=+@-]/.test(l.replace(/,"[^"]*"/g, ','))), csv.out);
});

test('hostile: __proto__, constructor and toString as aliases, keys and catalog names change nothing', async () => {
  const text = `${CATALOG.replace('[bundles]', '__proto__ = "g:proto:1.0"\nconstructor = "g:ctor:1.0"\n\n[bundles]\ntoString = ["__proto__"]')}`.replace('[versions]\n', '[versions]\nhasOwnProperty = "1"\n');
  const r = await run(projectWith({ [T]: text, [B]: `${BUILD}dependencies { implementation(libs.bundles.toString) }\n` }), ['p', '--json']);
  const out = JSON.parse(r.out);
  assert.deepEqual(out.findings.map((f) => [f.rule, f.found.slice(0, 26)]), [['unused-version', 'the version "hasOwnPropert'], ['unused-catalog-entry', 'the library "constructor" ']]);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.toString.call([]), '[object Array]');
});

test('hostile: CRLF, CR and a byte order mark give the same report as LF', async () => {
  const text = edit(CATALOG, ['coreKtx = "1.13.1"', 'coreKtx = "1.+"']);
  const lf = await run(projectWith({ [T]: text }), ['p', '--json']);
  for (const [name, change] of [['CRLF', (t) => t.split('\n').join('\r\n')], ['BOM', (t) => `\ufeff${t}`]]) {
    const other = await run(projectWith({ [T]: change(text), [B]: change(BUILD), [S]: change(PROJECT[S]) }), ['p', '--json']);
    assert.deepEqual(JSON.parse(other.out).findings.map((f) => [f.rule, f.line]), JSON.parse(lf.out).findings.map((f) => [f.rule, f.line]), name);
    assert.equal(other.code, 1, name);
  }
  const cr = JSON.parse((await run(projectWith({ [B]: `${BUILD}repositories { jcenter() }\n`.split('\n').join('\r') }), ['p', '--json'])).out);
  assert.deepEqual(cr.findings.map((f) => f.rule), ['jcenter-repository'], 'a Gradle file with CR line ends is read');
});

test('hostile: a symbolic link in the project is counted and not followed, a link named is refused, and a linked catalog is not read', async (t) => {
  if (process.platform === 'win32') {
    t.skip('symbolic links need extra rights on Windows');
    return;
  }
  await withFiles(PROJECT, async (dir) => {
    await mkdir(resolve(dir, 'outside'));
    await writeFile(resolve(dir, 'outside/build.gradle'), 'repositories { jcenter() }\n');
    await writeFile(resolve(dir, 'outside/x.versions.toml'), CATALOG);
    await symlink(resolve(dir, 'outside'), resolve(dir, 'p/loop'));
    await symlink(resolve(dir, 'outside/build.gradle'), resolve(dir, 'p/linked.gradle'));
    await symlink(resolve(dir, 'p'), resolve(dir, 'p-link'));
    const r = await cli(['p', '--json'], dir);
    const out = JSON.parse(r.out);
    assert.equal(out.input.links, 2);
    assert.deepEqual(out.findings, []);
    assert.match(out.notes.join('\n'), /2 symbolic links are not followed/);
    const named = await cli(['p-link'], dir);
    assert.equal(named.code, 2);
    assert.match(named.err, /is a symbolic link, which is not followed/);
    await symlink(resolve(dir, 'outside/x.versions.toml'), resolve(dir, 'link.versions.toml'));
    const catalog = await cli(['p', '--catalog', 'link.versions.toml'], dir);
    assert.equal(catalog.code, 2);
    await writeFile(resolve(dir, 'p/gradle/libs.versions.toml.bak'), 'x');
    const original = resolve(dir, 'p/gradle/libs.versions.toml');
    await writeFile(resolve(dir, 'outside/libs.versions.toml'), CATALOG);
    await chmod(resolve(dir, 'outside/libs.versions.toml'), 0o644);
    await (await import('node:fs/promises')).rm(original);
    await symlink(resolve(dir, 'outside/libs.versions.toml'), original);
    const linked = JSON.parse((await cli(['p', '--json'], dir)).out);
    assert.ok(linked.findings.some((f) => f.rule === 'unreadable-file' && /symbolic link/.test(f.found)), 'the default catalog through a link is not read');
  });
});

test('hostile: a device named as a project is refused, and a Gradle file with no read access is an unreadable-file error', async (t) => {
  if (process.platform === 'win32') {
    t.skip('devices and file modes work differently on Windows');
    return;
  }
  const device = await cli(['/dev/null'], process.cwd());
  assert.equal(device.code, 2);
  assert.match(device.err, /is not a regular file or folder/);
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user reads every file whatever its mode');
    return;
  }
  await withFiles(PROJECT, async (dir) => {
    await chmod(resolve(dir, B), 0o000);
    const r = await cli(['p', '--json'], dir);
    assert.match(JSON.parse(r.out).findings.find((f) => f.rule === 'unreadable-file').found, /cannot be read \(EACCES\)/);
    await chmod(resolve(dir, B), 0o644);
  });
});
