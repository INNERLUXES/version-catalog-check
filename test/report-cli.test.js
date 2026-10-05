import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CSV_COLUMNS, NOTICE, USAGE, VERSION, csvField, escapeData, escapeProperty, parseArgs } from '../src/index.js';
import { B, BUILD, CATALOG, PROJECT, T, buildWith, catalogWith, cli, columnOf, edit, lineOf, projectWith, run, withFiles } from './helpers.js';

const WARN = buildWith(['dependencies {\n', 'dependencies {\n    implementation("com.squareup.okio:okio:3.9.0")\n']);
const ERROR = catalogWith(['coreKtx = "1.13.1"', 'coreKtx = "1.+"']);
const INFO = buildWith(['ksp(libs.room.compiler)', 'kapt(libs.room.compiler)']);
const ERROR_TEXT = edit(CATALOG, ['coreKtx = "1.13.1"', 'coreKtx = "1.+"']);

test('cli: exit 0 below the fail-on level, 1 at or above it, from the flag or the configuration', async () => {
  const clean = await run(PROJECT);
  assert.equal(clean.code, 0, clean.err);
  assert.match(clean.out, /^version-catalog-check: p\ninput: 2 Gradle files \(1 settings file\); 1 catalog; 1 other file passed over; 0 folders named build, \.gradle or \.git passed over; 0 paths excluded; 0 links not followed\ncatalogs: p\/gradle\/libs\.versions\.toml \(libs\)\nconfig: built-in defaults: BOMs androidx\.compose:compose-bom, com\.google\.firebase:firebase-bom and org\.jetbrains\.kotlinx:kotlinx-coroutines-bom; deprecated libraries com\.android\.support:\*, com\.android\.support\.\*:\* and android\.arch\.\*:\*; /);
  assert.match(clean.out, /\nfindings: 0\n/);
  assert.match(clean.out, /RESULT: PASS - no finding at or above error\n$/);
  assert.equal(clean.err, '');
  assert.equal((await run(WARN)).code, 0, 'a warning does not fail the run by default');
  assert.equal((await run(WARN, ['p', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(INFO, ['p', '--fail-on', 'warning'])).code, 0);
  assert.equal((await run(INFO, ['p', '--fail-on', 'info'])).code, 1);
  const configured = await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['p', '--config', 'c.json']);
  assert.equal(configured.code, 1);
  assert.match(configured.out, /RESULT: FAIL - 1 finding at or above warning \(1 warning\)\n$/);
  assert.equal((await run({ ...WARN, 'c.json': '{"failOn": "warning"}' }, ['p', '--config', 'c.json', '--fail-on', 'error'])).code, 0, 'the flag wins over the configuration');
  const error = await run(ERROR);
  assert.equal(error.code, 1);
  assert.match(error.out, /RESULT: FAIL - 1 finding at or above error \(1 error\)\n$/);
});

test('cli: a catalog that is not TOML and a Gradle file that is not text are unreadable-file errors at their place, and the run goes on', async () => {
  const bad = edit(CATALOG, ['[plugins]', '[[plugins]]']);
  const r = await run(projectWith({ [T]: bad, 'p/lib/build.gradle': Buffer.from([0x3c, 0, 0x3e]) }), ['p', '--json']);
  assert.equal(r.code, 1);
  const out = JSON.parse(r.out);
  const f = out.findings.filter((x) => x.rule === 'unreadable-file');
  assert.deepEqual(f.map((x) => [x.file, x.line, x.column]), [['p/gradle/libs.versions.toml', lineOf(bad, '[[plugins]]'), columnOf(bad, '[[plugins]]')], ['p/lib/build.gradle', 1, 1]]);
  assert.match(f[0].found, /the catalog cannot be read as TOML: an array of tables/);
  assert.match(f[1].found, /the Gradle file cannot be read: .*holds binary data/);
  assert.deepEqual(out.catalogs, []);
  assert.deepEqual(out.modules.map((m) => [m.file, m.read]), [[B, true], ['p/lib/build.gradle', false], ['p/settings.gradle.kts', true]]);
  assert.match((await run(projectWith({ 'p/lib/build.gradle': Buffer.from([0x61, 0xe9]) }))).out, /p\/lib\/build\.gradle {2,}not read/);
  const big = await run(projectWith({ [T]: `# ${'x'.repeat(200)}\n${CATALOG}` }), ['p', '--json'], { maxFileBytes: 100 });
  assert.match(JSON.parse(big.out).findings.find((x) => x.file === T).found, /the catalog cannot be read: .*bytes is over the 100 byte limit/);
});

test('cli: a Gradle file saved as UTF-16 with its byte order mark, or with CRLF line ends, gives the same findings', async () => {
  const text = `${BUILD}repositories { jcenter() }\n`;
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const base = JSON.parse((await run(projectWith({ [B]: text }), ['p', '--json'])).out);
  for (const content of [le, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)]), text.split('\n').join('\r\n')]) {
    const r = JSON.parse((await run(projectWith({ [B]: content }), ['p', '--json'])).out);
    assert.deepEqual(r.findings, base.findings);
  }
});

test('cli: --min-severity hides the findings below it and says so', async () => {
  const r = await run(INFO, ['p', '--min-severity', 'warning']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0; 1 below warning not shown/);
  assert.match(r.out, /note: 1 finding below warning is not shown/);
});

test('cli: the project, --catalog and --exclude must be usable, or the run stops with no result', async () => {
  const file = await run(PROJECT, [B]);
  assert.equal(file.code, 2);
  assert.match(file.err, /p\/app\/build\.gradle\.kts: is a file; give the folder of the Gradle project/);
  assert.match((await run(PROJECT, ['nowhere'])).err, /nowhere: no such file or folder/);
  assert.match((await run(PROJECT, ['p', '--catalog', 'none.toml'])).err, /--catalog none\.toml: no such file or folder/);
  assert.match((await run(PROJECT, ['p', '--catalog', 'p/gradle'])).err, /--catalog p\/gradle: is a folder; give the \.versions\.toml file/);
  assert.match((await run(PROJECT, ['p', '--catalog', T, '--catalog', T])).err, /is named twice/);
  assert.match((await run(PROJECT, ['p', '--exclude', '../x'])).err, /--exclude "\.\.\/x" leaves the project folder with \.\./);
});

test('cli: usage errors give exit code 2 and the usage', async () => {
  for (const argv of [[], ['--format', 'xml', 'p'], ['--min-severity', 'fatal', 'p'], ['--fail-on'], ['p', '--bogus'], ['p', '--config', 'a', '--config', 'b'], ['p', '--explain', '--format', 'csv'], ['p', '--json', '--format', 'csv'], ['-'], ['p', '--catalog', '-'], ['https://example.test/project'], ['p', '--catalog', 'https://a.test/libs.versions.toml'], ['p', 'q'], ['p', '--exclude', '--json']]) {
    const r = await cli(argv, process.cwd());
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.out, '');
    assert.match(r.err, /^version-catalog-check: .+\n\nUsage: version-catalog-check/, argv.join(' '));
  }
  assert.match((await cli(['https://example.test/project'], process.cwd())).err, /never fetches a URL/);
  assert.match((await cli(['p', 'q'], process.cwd())).err, /give one project folder/);
  assert.throws(() => parseArgs(['p', ...Array.from({ length: 21 }, () => ['--catalog', 'x']).flat()]), /more than 20 catalogs named/);
  assert.throws(() => parseArgs(['p', ...Array.from({ length: 101 }, () => ['--exclude', 'x']).flat()]), /more than 100 exclude patterns/);
  assert.deepEqual(parseArgs(['p', '--catalog', 'a', '--catalog', 'b', '--exclude', 'c']).catalogs, ['a', 'b']);
});

test('cli: --help, --version and --print-defaults', async () => {
  const help = await cli(['--help'], process.cwd());
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const s of ['--catalog', '--exclude', '--config', '--format', '--json', '--min-severity', '--fail-on', '--explain', '--print-defaults', 'Exit codes: 0', 'dynamic-version (rules.dynamicVersion)', 'unreadable-file (always error)', 'never says what the latest version is']) assert.ok(USAGE.includes(s), s);
  assert.equal((await cli(['-v'], process.cwd())).out, `${VERSION}\n`);
  const d = await cli(['--print-defaults'], process.cwd());
  assert.equal(JSON.parse(d.out).name, 'built-in defaults');
  assert.equal(JSON.parse(d.out).boms[0].bom, 'androidx.compose:compose-bom');
});

test('report: the JSON report holds the input, the configuration, the catalogs, the files, the summary, the rules, the findings and the result', async () => {
  const r = await run(ERROR, ['p', '--json']);
  const out = JSON.parse(r.out);
  assert.deepEqual(Object.keys(out), ['tool', 'version', 'input', 'config', 'catalogs', 'modules', 'summary', 'rules', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.equal(out.tool, 'version-catalog-check');
  assert.equal(out.notice, NOTICE);
  const f = out.findings[0];
  assert.deepEqual(Object.keys(f), ['rule', 'level', 'file', 'line', 'column', 'at', 'found', 'fix']);
  assert.equal(f.at, `${T}:${f.line}`);
  assert.equal(out.rules.length, 15);
  assert.deepEqual(Object.keys(out.modules[0]), ['file', 'module', 'read', 'catalog', 'hardCoded', 'strings', 'plugins', 'platforms', 'byLevel']);
  assert.deepEqual(Object.keys(out.summary), ['versions', 'libraries', 'bundles', 'plugins', 'unusedEntries', 'unusedVersions', 'hardCoded', 'catalogReferences', 'boms', 'kapt']);
  const explained = JSON.parse((await run(ERROR, ['p', '--json', '--explain'])).out);
  assert.ok(explained.findings[0].basis.length > 0);
  assert.ok(explained.findings[0].own.length > 0);
});

test('report: --explain adds the rule, the points of the public pages and the own choice to the text', async () => {
  const r = await run(ERROR, ['p', '--explain']);
  assert.match(r.out, /\n {11}rule: a version written with \+, latest\.\* or as a range\n {11}basis: Gradle takes ranges such as \[1\.0,2\.0\).+\(Declaring Versions and Ranges \(Gradle User Manual\), https:\/\/docs\.gradle\.org\/current\/userguide\/dependency_versions\.html\)\n/);
  assert.match(r.out, /\n {11}the tool's own choice: /);
});

test('report: CSV with one record per finding, CRLF line ends, quotes and a neutralized formula', async () => {
  const r = await run(ERROR, ['p', '--format', 'csv']);
  assert.equal(r.code, 1);
  const lines = r.out.split('\r\n');
  assert.equal(lines[0], CSV_COLUMNS.join(','));
  assert.equal(lines.at(-1), '');
  assert.equal(lines.length, 3);
  assert.match(lines[1], new RegExp(`^error,dynamic-version,p/gradle/libs\\.versions\\.toml,${lineOf(ERROR_TEXT, 'coreKtx =')},${columnOf(ERROR_TEXT, '"1.+"')},"the version ""coreKtx"" of the catalog libs is 1\\.\\+:`));
  assert.equal(csvField('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvField('-1'), "'-1");
  assert.equal(csvField('@x'), "'@x");
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('a"b'), '"a""b"');
  assert.equal(csvField(null), '');
});

test('report: GitHub commands with file, line, column and title, escaped, and a summary line', async () => {
  const r = await run(ERROR, ['p', '--format', 'github']);
  const lines = r.out.trimEnd().split('\n');
  assert.match(lines[0], new RegExp(`^::error file=p/gradle/libs\\.versions\\.toml,line=${lineOf(ERROR_TEXT, 'coreKtx =')},col=${columnOf(ERROR_TEXT, '"1.+"')},title=version-catalog-check dynamic-version::the version "coreKtx"`));
  assert.equal(lines.at(-1), 'version-catalog-check: 1 catalog, 2 Gradle files, 1 finding; RESULT: FAIL - 1 finding at or above error (1 error)');
  assert.equal(escapeData('50%\r\nx'), '50%25%0D%0Ax');
  assert.equal(escapeProperty('a:b,c'), 'a%3Ab%2Cc');
  const info = await run(INFO, ['p', '--format', 'github']);
  assert.match(info.out, /^::notice file=p\/app\/build\.gradle\.kts,line=\d+,col=\d+,title=version-catalog-check kapt-processor::/);
});

test('report: the text names each catalog and Gradle file with its counts, a summary, and ends with the notice and the result', async () => {
  const r = await run(WARN);
  assert.ok(r.out.includes('\n  p/gradle/libs.versions.toml  libs  4         5          1        1        0\n'), r.out);
  assert.ok(r.out.includes('\n  p/app/build.gradle.kts  :app      5        1        1             1        0      1        0\n'), r.out);
  assert.ok(r.out.includes('\n  catalog entries: 5 libraries, 1 bundle, 1 plugin, 4 versions\n'));
  assert.ok(r.out.includes('\n  dependencies: 5 through a catalog, 1 written with a version in a build file\n'));
  assert.ok(r.out.includes(`\n${NOTICE}\n\nRESULT: PASS - no finding at or above error (1 warning)\n`));
  const empty = await withFiles({ 'e/readme.txt': 'x' }, (dir) => cli(['e'], dir));
  assert.equal(empty.code, 0);
  assert.match(empty.out, /0 Gradle files \(0 settings files\); 0 catalogs; 1 other file passed over/);
  assert.match(empty.out, /\nCatalogs \(0\)\n\n {2}none\n/);
  assert.match(empty.out, /\nGradle files \(0\)\n\n {2}none\n/);
  assert.match(empty.out, /note: the project holds no Gradle file/);
  const noSettings = await withFiles({ 'm/build.gradle': 'dependencies {}\n' }, (dir) => cli(['m'], dir));
  assert.match(noSettings.out, /note: the project folder has no settings\.gradle or settings\.gradle\.kts at its top/);
});

test('cli: a run writes nothing to the folders it reads', async () => {
  await withFiles(WARN, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    const r = await cli(['p', '--format', 'csv', '--fail-on', 'warning'], dir);
    assert.equal(r.code, 1);
    assert.deepEqual((await readdir(dir, { recursive: true })).sort(), before);
    assert.ok(resolve(dir).length > 0);
  });
});
