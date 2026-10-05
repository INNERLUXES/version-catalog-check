import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const T = 'examples/messy/gradle/libs.versions.toml';
const A = 'examples/messy/app/build.gradle.kts';

test('examples: the messy project fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean project passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
  assert.equal((await run([...CLEAN, '--fail-on', 'info'])).code, 0);
  assert.equal((await run([...CLEAN, '--config', 'examples/config.json', '--fail-on', 'info'])).code, 0, 'the clean project also meets the configuration of the messy one');
});

test('examples: --explain, JSON, CSV, the GitHub commands and the defaults are the reports that are saved', async () => {
  const outputs = { 'messy-explain.txt': [...MESSY, '--explain'], 'messy.json': [...MESSY, '--json', '--explain'], 'messy-findings.csv': [...MESSY, '--format', 'csv'], 'messy-github.txt': [...MESSY, '--format', 'github'], 'defaults.json': ['--print-defaults'] };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: the rules that fire on the messy project, each on the line built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const lines = {};
  for (const f of [T, A, 'examples/messy/settings.gradle.kts', 'examples/messy/core/build.gradle']) lines[f] = (await readFile(resolve(root, f), 'utf8')).split('\n');
  const at = (file, needle, n = 1) => `${file}:${lines[file].map((l, i) => [l, i]).filter(([l]) => l.includes(needle))[n - 1][1] + 1}`;
  const byRule = {};
  for (const x of report.findings) (byRule[x.rule] ??= []).push(x.at);
  assert.deepEqual(byRule, {
    'deprecated-coordinate': [at(A, 'appcompat-v7')],
    'dynamic-version': [at(T, 'okhttp = "4.+"')],
    'missing-version-ref': [at(T, 'glide =')],
    'duplicate-library': [at(T, 'core-ktx = "')],
    'version-conflict': [at(T, 'core-ktx = "')],
    'jcenter-repository': [at('examples/messy/settings.gradle.kts', 'jcenter()')],
    'hard-coded-dependency': [at(A, 'ui-tooling-preview'), at(A, 'converter-moshi'), at(A, 'appcompat-v7')],
    'version-next-to-bom': [at(A, 'ui-tooling-preview'), at(T, 'compose-material3 =')],
    'maven-local-repository': [at('examples/messy/core/build.gradle', 'mavenLocal()')],
    'unused-version': [at(T, 'timber =')],
    'unused-catalog-entry': [at(T, 'picasso =')],
    'kapt-processor': [at(A, 'kapt(libs.room.compiler)')]
  });
  assert.deepEqual(report.modules.map((m) => [m.file, m.module, m.catalog, m.strings, m.hardCoded]), [[A, ':app', 13, 3, 3], ['examples/messy/build.gradle.kts', ':', 0, 0, 0], ['examples/messy/core/build.gradle', ':core', 1, 0, 0], ['examples/messy/settings.gradle.kts', 'settings', 0, 0, 0]]);
  assert.equal(report.summary.kapt, true);
});

test('examples: without the configuration, the legacy module is read too; the build folder never is', async () => {
  const report = JSON.parse((await run(['examples/messy', '--json'])).out);
  assert.ok(report.findings.some((f) => f.file === 'examples/messy/legacy/build.gradle' && f.rule === 'jcenter-repository'));
  assert.ok(!report.findings.some((f) => f.file.includes('/build/')));
  assert.equal(report.input.foldersPassedOver, 1);
});

test('examples: the same files written with CRLF line ends and as UTF-16 give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'version-catalog-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    for (const f of [T, A, 'examples/messy/settings.gradle.kts', 'examples/messy/core/build.gradle']) {
      const text = (await readFile(resolve(root, f), 'utf8')).split('\r\n').join('\n');
      await writeFile(resolve(dir, f), text.split('\n').join('\r\n'));
    }
    const catalog = (await readFile(resolve(root, 'examples/clean/gradle/libs.versions.toml'), 'utf8')).split('\n').join('\r\n');
    await writeFile(resolve(dir, 'examples/clean/gradle/libs.versions.toml'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(catalog, 'utf16le')]));
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
    assert.ok((await readdir(resolve(dir, 'examples/messy'))).includes('legacy'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
