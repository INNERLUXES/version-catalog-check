// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// projects to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy', '--config', 'examples/config.json'];
export const CLEAN = ['examples/clean'];
const T = 'examples/messy/gradle/libs.versions.toml';

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy project: the counts, the summary, one finding of every rule that fires, and the
// result.
export const EXPECTED = [
  'input: 4 Gradle files (1 settings file); 1 catalog',
  '1 folder named build, .gradle or .git passed over; 1 path excluded',
  `catalogs: ${T} (libs)`,
  'config: examples/config.json (Harborlight dependency review): BOMs androidx.compose:compose-bom',
  'findings: 15 (6 error, 8 warning, 1 info)',
  'catalog entries: 16 libraries, 1 bundle, 4 plugins, 12 versions',
  'unused: 1 catalog entry, 1 version',
  'dependencies: 14 through a catalog, 3 written with a version in a build file',
  'BOMs in the project: androidx.compose:compose-bom',
  'the library "glide" has version.ref = "glide", but [versions] has no key glide',
  'the version "okhttp" of the catalog libs is 4.+',
  'the library "core-ktx" of the catalog libs has the coordinates androidx.core:core-ktx',
  'androidx.core:core-ktx has version 1.12.0 in the library "core-ktx" of the catalog libs, and version.ref "coreKtx" (1.13.1)',
  'com.android.support:appcompat-v7 (the dependency "com.android.support:appcompat-v7:28.0.0" in implementation) matches com.android.support:*',
  'jcenter() is a repository of this build',
  'the library "picasso" (com.squareup.picasso:picasso) of the catalog libs is never used',
  'the version "timber" of the catalog libs is never used',
  'the dependency "com.squareup.retrofit2:converter-moshi:2.11.0" in implementation is written with its version',
  'the library "compose-material3" of the catalog libs gives androidx.compose.material3:material3 version 1.2.1, while the BOM androidx.compose:compose-bom',
  'the dependency "androidx.compose.ui:ui-tooling-preview:1.6.8" in implementation gives androidx.compose.ui:ui-tooling-preview version 1.6.8',
  'mavenLocal() is a repository of this build',
  'androidx.room:room-compiler (libs.room.compiler) runs with kapt',
  'note: 1 path matching legacy/** is left out',
  'not a Gradle build and not a dependency resolution',
  'RESULT: FAIL - 6 findings at or above error (6 error, 8 warning, 1 info)'
];
// What must not be reported: the dependency that is commented out, the legacy module that is excluded, the copy in the
// build folder, the libraries used through the bundle, the Compose library with no version, and the version read
// through libs.versions.
export const UNWANTED = ['okhttp:3.14.9', 'junit:junit:4.+', 'recyclerview-v7', 'copied.gradle', 'legacy/build.gradle', '"room-runtime"', '"room-ktx"', '"compose-ui"', '"compileSdk"', 'ERROR    unreadable-file', 'ERROR    invalid-catalog-entry', 'RESULT: PASS'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy project', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean project', clean, 0, ['3 Gradle files (1 settings file); 1 catalog', 'catalogs: examples/clean/gradle/libs.versions.toml (libs)', 'findings: 0', 'unused: 0 catalog entries, 0 versions', 'kapt: not applied', 'RESULT: PASS - no finding at or above error'], ['  WARNING  ', '  ERROR  ', '  INFO  ', 'RESULT: FAIL']);

  // Without the configuration, the legacy module is read too, with its jcenter() and its Support Library.
  expect('messy, no configuration', await run(['examples/messy']), 1, ['examples/messy/legacy/build.gradle', 'com.android.support:recyclerview-v7', 'findings: 18 (8 error, 9 warning, 1 info)'], ['copied.gradle']);
  // Only the errors are shown with --min-severity error.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 6 (6 error); 9 below error not shown', 'RESULT: FAIL - 6 findings at or above error'], ['WARNING  ', 'INFO  ']);
  // The clean project passes when every level fails the run.
  expect('clean, fail on info', await run([...CLEAN, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // A path that is a file stops the run.
  expect('a project that is a file', await run([T]), 2, [`${T}: is a file; give the folder of the Gradle project`], [], 'err');

  // The README shows the whole report of the messy project, the --explain lines of one finding, the GitHub annotations
  // of two findings, the start of the CSV report and the report of the clean project.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy project differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean project differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('dynamic-version') && l.includes(`${T}:`));
  const sample = lines.slice(at, at + 8).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the dynamic version differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  const picked = github.out.split('\n').filter((x) => x.includes('title=version-catalog-check missing-version-ref::') || (x.includes('title=version-catalog-check hard-coded-dependency::') && x.includes('converter-moshi')));
  if (picked.length !== 2) problems.push('github: the sample lines are not in the output');
  for (const l of picked) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const csv = await run([...MESSY, '--format', 'csv']);
  if (csv.code !== 1) problems.push(`csv: exit code ${csv.code}, expected 1`);
  const head = csv.out.split('\r\n').slice(0, 4).join('\n');
  if (!readme.includes(head)) problems.push('README: the CSV sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-findings.csv'), csv.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
