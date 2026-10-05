import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, catalogNameOf, defaultConfig, longestAccessor, moduleOf, scanGradle } from '../src/index.js';
import { B, BUILD, CATALOG, PROJECT, S, SETTINGS, T, buildWith, catalogOf, catalogWith, columnOf, edit, findingsOf, lineOf, projectWith, reportOf, rulesOf } from './helpers.js';

// Every rule through a whole run, on the good project with one part changed, with a near miss on each side: the form
// that is reported and the form next to it that is not.

const only = async (files, rule, args) => findingsOf(await reportOf(files, args), rule);

test('project: the good project has no finding, and its summary counts every entry and file', async () => {
  const r = await reportOf(PROJECT);
  assert.deepEqual(r.findings, []);
  assert.equal(r.code, 0);
  assert.deepEqual([r.summary.libraries, r.summary.bundles, r.summary.plugins, r.summary.versions, r.summary.catalogReferences, r.summary.hardCoded], [5, 1, 1, 4, 5, 0]);
  assert.deepEqual(r.summary.boms, ['androidx.compose:compose-bom']);
  assert.equal(r.summary.kapt, false);
  assert.deepEqual(r.modules.map((m) => [m.file, m.module, m.catalog, m.plugins, m.platforms]), [[B, ':app', 5, 1, 1], [S, 'settings', 0, 0, 0]]);
  assert.deepEqual(r.catalogs, [{ file: T, name: 'libs', versions: 4, libraries: 5, bundles: 1, plugins: 1, unused: 0, how: 'default' }]);
});

test('unused-catalog-entry: a library, a bundle and a plugin no Gradle file names; a library used through a bundle is used', async () => {
  const f = await only(buildWith(['    implementation(libs.bundles.room)\n', ''], ['    alias(libs.plugins.kotlin.android)\n', '']), 'unused-catalog-entry');
  assert.deepEqual(f.map((x) => [x.line, x.found.slice(0, 40)]), [[lineOf(CATALOG, 'room-runtime ='), 'the library "room-runtime" (androidx.roo'], [lineOf(CATALOG, 'room = ['), 'the bundle "room" of the catalog libs is'], [lineOf(CATALOG, 'kotlin-android ='), 'the plugin "kotlin-android" (org.jetbrai']]);
  assert.match(f[1].found, /no Gradle file names libs\.bundles\.room/);
  assert.equal(f[0].level, 'warning');
  assert.deepEqual(await only(PROJECT, 'unused-catalog-entry'), [], 'room-runtime is used through the bundle');
  assert.deepEqual(await only(buildWith(['implementation(libs.compose.ui)', '// implementation(libs.compose.ui)\n    val name = "libs.compose.ui"']), 'unused-catalog-entry').then((x) => x.map((y) => y.line)), [lineOf(CATALOG, 'compose-ui =')], 'a name in a comment or a string does not count');
});

test('unused-catalog-entry: the accessor reads dashes, underscores and dots alike, and the longest accessor wins', async () => {
  const files = projectWith({ [T]: edit(CATALOG, ['androidx-core-ktx =', 'androidx_core-ktx =']).replace('[bundles]', 'androidx-core = { module = "androidx.core:core", version = "1.13.1" }\n\n[bundles]') });
  const f = await only(files, 'unused-catalog-entry');
  assert.deepEqual(f.map((x) => x.found.slice(0, 30)), ['the library "androidx-core" (a'], 'libs.androidx.core.ktx uses androidx_core-ktx, not androidx-core');
  const groovy = projectWith({ 'p/app/build.gradle': 'dependencies { implementation libs.compose.ui }\n', [B]: edit(BUILD, ['    implementation(libs.compose.ui)\n', '']) });
  assert.deepEqual(await only(groovy, 'unused-catalog-entry'), [], 'a Groovy build file counts too');
});

test('unused-version: a key no version.ref and no libs.versions reads; a key read through libs.versions is used', async () => {
  const f = await only(catalogWith(['[versions]\n', '[versions]\ncompileSdk = "34"\nunusedKey = "1.0"\n']), 'unused-version');
  assert.deepEqual(f.map((x) => x.line), [lineOf(CATALOG, '[versions]') + 1, lineOf(CATALOG, '[versions]') + 2]);
  assert.match(f[1].found, /the version "unusedKey" of the catalog libs is never used: no version.ref names it and no Gradle file reads libs.versions.unusedKey/);
  const read = projectWith({ [T]: edit(CATALOG, ['[versions]\n', '[versions]\ncompileSdk = "34"\n']), [B]: `${BUILD}android { compileSdk = libs.versions.compileSdk.get().toInt() }\n` });
  assert.deepEqual(await only(read, 'unused-version'), []);
});

test('missing-version-ref: at the place of the ref, as an error that fails the run', async () => {
  const text = edit(CATALOG, ['version.ref = "coreKtx"', 'version.ref = "coreKtx2"']);
  const r = await reportOf(projectWith({ [T]: text }));
  const f = findingsOf(r, 'missing-version-ref');
  assert.deepEqual(f.map((x) => [x.line, x.column, x.level]), [[lineOf(text, '"coreKtx2"'), columnOf(text, '"coreKtx2"'), 'error']]);
  assert.equal(r.code, 1);
  assert.deepEqual(findingsOf(r, 'unused-version').map((x) => x.found.slice(0, 23)), ['the version "coreKtx" o']);
});

test('dynamic-version: +, latest.*, ranges and rich versions, in the catalog and in build files; a plain version and reject are not', async () => {
  const text = edit(CATALOG, ['coreKtx = "1.13.1"', 'coreKtx = "1.+"'], ['kotlin = "2.0.21"', 'kotlin = { strictly = "[2.0,2.1)", reject = ["2.0.0+"] }'], ['room = "2.6.1"', 'room = "latest.release"']);
  const build = edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation("a.b:c:]1.0,2.0[")\n    implementation("a.b:d:+")\n    implementation("a.b:e:1.0+beta")\n    implementation("a.b:f:$v")\n    implementation("a.b:g:1.0")\n']);
  const f = await only(projectWith({ [T]: text, [B]: build }), 'dynamic-version');
  assert.deepEqual(f.map((x) => [x.file, x.line]), [[B, lineOf(build, 'a.b:c')], [B, lineOf(build, 'a.b:d')], [T, lineOf(text, 'kotlin =')], [T, lineOf(text, 'coreKtx =')], [T, lineOf(text, 'room =')]]);
  assert.match(f[2].found, /the strictly of the version "kotlin" of the catalog libs is \[2\.0,2\.1\): the range \[2\.0,2\.1\) takes the newest version inside it/);
  assert.match(f[3].found, /the prefix version 1\.\+ takes the newest version that starts with 1\./);
  assert.match(f[4].found, /the status version latest\.release/);
  assert.equal(f.length, 5, 'a version.ref to a dynamic key is reported once, at the key; reject is not read; 1.0+beta is a plain version and $v a variable');
  const inline = await only(catalogWith(['name = "ui" }', 'name = "ui", version = { prefer = "1.+" } }']), 'dynamic-version');
  assert.match(inline[0].found, /the prefer of the version of the library "compose-ui" is 1\.\+/);
  const plugin = await only(catalogWith(['version.ref = "kotlin" }', 'version = "2.+" }']), 'dynamic-version');
  assert.match(plugin[0].found, /the version of the plugin "kotlin-android" is 2\.\+/);
});

test('duplicate-library and version-conflict: two aliases of one module, and one module with two versions across catalog and build files', async () => {
  const text = `${CATALOG.replace('[bundles]', 'core = "androidx.core:core-ktx:1.13.1"\ncore-old = { group = "androidx.core", name = "core-ktx", version = "1.9.0" }\n\n[bundles]')}`;
  const build = edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation(libs.core)\n    implementation(libs.core.old)\n    implementation("androidx.room:room-runtime:2.5.0")\n    implementation("androidx.room:room-runtime:2.6.1")\n']);
  const r = await reportOf(projectWith({ [T]: text, [B]: build }));
  assert.deepEqual(findingsOf(r, 'duplicate-library').map((x) => x.line), [lineOf(text, 'core ='), lineOf(text, 'core-old =')]);
  assert.match(findingsOf(r, 'duplicate-library')[0].found, new RegExp(`as the library "androidx-core-ktx" of the catalog libs does \\(${T.replace(/\./g, '\\.')}:${lineOf(text, 'androidx-core-ktx =')}\\)`));
  const conflicts = findingsOf(r, 'version-conflict');
  assert.deepEqual(conflicts.map((x) => [x.file, x.line]), [[B, lineOf(build, 'room-runtime:2.5.0')], [T, lineOf(text, 'core-old =')]]);
  assert.match(conflicts[0].found, /androidx\.room:room-runtime has version 2\.5\.0 in the dependency "androidx\.room:room-runtime:2\.5\.0" in implementation, and version\.ref "room" \(2\.6\.1\) in the library "room-runtime"/);
  assert.match(conflicts[1].found, /version 1\.9\.0 in the library "core-old"/);
  assert.deepEqual(await only(projectWith({ [B]: edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation("androidx.room:room-runtime:2.6.1")\n']) }), 'version-conflict'), [], 'the same version is no conflict');
});

test('deprecated-coordinate: the Support Library, android.arch and kotlin-android-extensions, in the catalog and in build files', async () => {
  const text = CATALOG.replace('[bundles]', 'appcompat = "com.android.support:appcompat-v7:28.0.0"\nlifecycle = "android.arch.lifecycle:runtime:1.1.1"\nconstraint = "com.android.support.constraint:constraint-layout:1.1.3"\nandroidx = "androidx.appcompat:appcompat:1.7.0"\n\n[bundles]').replace('[plugins]\n', '[plugins]\nsynthetics = { id = "kotlin-android-extensions", version = "1.9.0" }\n');
  const build = edit(BUILD, ['plugins {\n', 'plugins {\n    id("kotlin-android-extensions")\n    id("kotlin-parcelize")\n'], ['dependencies {\n', 'dependencies {\n    implementation(libs.appcompat)\n    implementation(libs.lifecycle)\n    implementation(libs.constraint)\n    implementation(libs.androidx)\n    implementation(libs.plugins.synthetics)\n    implementation("com.android.support:design")\n']);
  const f = await only(projectWith({ [T]: text, [B]: build }), 'deprecated-coordinate');
  assert.deepEqual(f.map((x) => [x.file, x.line]), [[B, lineOf(build, '"kotlin-android-extensions"')], [B, lineOf(build, 'support:design')], [T, lineOf(text, 'appcompat =')], [T, lineOf(text, 'lifecycle =')], [T, lineOf(text, 'constraint =')], [T, lineOf(text, 'synthetics =')]]);
  assert.match(f[0].found, /the plugin kotlin-android-extensions is deprecated; use view binding/);
  assert.match(f[3].found, /matches android\.arch\.\*:\*/);
  assert.equal(f[0].level, 'error');
});

test('jcenter-repository and maven-local-repository: in settings and build files, not in comments', async () => {
  const settings = edit(SETTINGS, ['        mavenCentral()\n    }\n}\n\nrootProject', '        mavenCentral()\n        jcenter()\n        // mavenLocal()\n    }\n}\n\nrootProject']);
  const build = `${BUILD}repositories {\n    mavenLocal()\n}\n`;
  const r = await reportOf(projectWith({ [S]: settings, [B]: build }));
  assert.deepEqual(findingsOf(r, 'jcenter-repository').map((x) => [x.file, x.line, x.level]), [[S, lineOf(settings, 'jcenter()'), 'error']]);
  assert.deepEqual(findingsOf(r, 'maven-local-repository').map((x) => [x.file, x.line, x.level]), [[B, lineOf(build, 'mavenLocal()'), 'warning']]);
});

test('hard-coded-dependency: a dependency string with a version, with a word when the catalog already has it; one with no version is not', async () => {
  const build = edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation("com.squareup.okio:okio:3.9.0")\n    implementation("androidx.room:room-runtime:2.6.1")\n    implementation("androidx.compose.material3:material3")\n    implementation("com.x:y:$version")\n']);
  const f = await only(projectWith({ [B]: build }), 'hard-coded-dependency');
  assert.deepEqual(f.map((x) => x.line), [lineOf(build, 'okio'), lineOf(build, 'room-runtime:2.6.1'), lineOf(build, 'com.x:y')]);
  assert.match(f[1].found, /the catalog already has it as libs\.room\.runtime/);
  assert.match(f[2].found, /\(from a variable\)/);
  const noCatalog = await only(projectWith({ [T]: null, [B]: 'dependencies { implementation("a:b:1.0") }\n' }), 'hard-coded-dependency');
  assert.match(noCatalog[0].found, /the project has no catalog yet/);
});

test('version-next-to-bom: a Compose library with a version next to the BOM; with no BOM, or excepted, it is not reported', async () => {
  const text = edit(CATALOG, ['name = "ui" }', 'name = "ui", version = "1.6.8" }']).replace('[bundles]', 'compose-compiler = { module = "androidx.compose.compiler:compiler", version = "1.5.14" }\n\n[bundles]');
  const build = edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation(libs.compose.compiler)\n    implementation("androidx.compose.foundation:foundation:1.6.8")\n']);
  const f = await only(projectWith({ [T]: text, [B]: build }), 'version-next-to-bom');
  assert.deepEqual(f.map((x) => [x.file, x.line]), [[B, lineOf(build, 'foundation:1.6.8')], [T, lineOf(text, 'compose-ui =')]]);
  assert.match(f[1].found, /gives androidx\.compose\.ui:ui version 1\.6\.8, while the BOM androidx\.compose:compose-bom is declared in the project/);
  const noBom = projectWith({ [T]: edit(text, ['compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }\n', '']), [B]: edit(build, ['    implementation(platform(libs.compose.bom))\n', '']) });
  assert.deepEqual(await only(noBom, 'version-next-to-bom'), []);
  const firebase = projectWith({ [B]: edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation(platform("com.google.firebase:firebase-bom:33.1.2"))\n    implementation("com.google.firebase:firebase-analytics:22.0.2")\n    implementation("com.google.firebase:firebase-auth")\n    classpath("com.google.firebase:firebase-crashlytics-gradle:3.0.2")\n']) });
  assert.deepEqual((await only(firebase, 'version-next-to-bom')).map((x) => x.found.slice(0, 60)), ['the dependency "com.google.firebase:firebase-analytics:22.0.'], 'the BoM itself, a library with no version and a Gradle plugin of Firebase are not reported');
});

test('kapt-processor: a kapt dependency on a processor with a KSP version, as a string and through the catalog; ksp and other processors are not', async () => {
  const build = edit(BUILD, ['ksp(libs.room.compiler)', 'kapt(libs.room.compiler)\n    kaptTest("com.google.dagger:dagger-compiler:2.51")\n    kapt("com.example:processor:1.0")\n    ksp("com.squareup.moshi:moshi-kotlin-codegen:1.15.1")'], ['plugins {\n', 'plugins {\n    id("kotlin-kapt")\n']);
  const r = await reportOf(projectWith({ [B]: build }));
  const f = findingsOf(r, 'kapt-processor');
  assert.deepEqual(f.map((x) => [x.line, x.level]), [[lineOf(build, 'kapt(libs.room'), 'info'], [lineOf(build, 'kaptTest'), 'info']]);
  assert.match(f[0].found, /androidx\.room:room-compiler \(libs\.room\.compiler\) runs with kapt/);
  assert.equal(r.summary.kapt, true);
  assert.equal(r.code, 0, 'a suggestion does not fail the run');
});

test('catalogs: the settings file names another catalog, --catalog names one more, and their accessors are read', async () => {
  const settings = `${SETTINGS}dependencyResolutionManagement {\n    versionCatalogs {\n        create("tools") {\n            from(files("gradle/tools.versions.toml"))\n        }\n        create("gone") {\n            from(files("gradle/gone.versions.toml"))\n        }\n        create("outside") {\n            from(files("../outside.versions.toml"))\n        }\n    }\n}\n`;
  const files = projectWith({ [S]: settings, 'p/gradle/tools.versions.toml': '[libraries]\nlint = "com.example:lint:1.0"\nunused = "com.example:unused:1.0"\n', 'extra/ci.versions.toml': '[libraries]\nci = "com.example:ci:1.0"\n', [B]: edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation(tools.lint)\n    implementation(ci.ci)\n']) });
  const r = await reportOf(files, ['p', '--catalog', 'extra/ci.versions.toml']);
  assert.deepEqual(r.catalogs.map((c) => [c.file, c.name, c.how]), [[T, 'libs', 'default'], ['p/gradle/tools.versions.toml', 'tools', 'settings'], ['extra/ci.versions.toml', 'ci', 'named']]);
  assert.deepEqual(findingsOf(r, 'unused-catalog-entry').map((x) => [x.file, x.found.slice(0, 22)]), [['p/gradle/tools.versions.toml', 'the library "unused" (']]);
  const unread = findingsOf(r, 'unreadable-file');
  assert.deepEqual(unread.map((x) => [x.file, x.line]), [[S, lineOf(settings, 'gone.versions')], [S, lineOf(settings, '../outside')]]);
  assert.match(unread[0].found, /reads the catalog gone from "gradle\/gone\.versions\.toml", which cannot be read: no such file or folder/);
  assert.match(unread[1].found, /outside the project folder/);
  const same = await reportOf(PROJECT, ['p', '--catalog', T]);
  assert.equal(same.catalogs.length, 1, 'a catalog named twice in two ways is read once');
});

test('catalogs: with no catalog at all the run still checks the build files and says so', async () => {
  const r = await reportOf(projectWith({ [T]: null, [B]: 'repositories { jcenter() }\n' }));
  assert.deepEqual(r.catalogs, []);
  assert.deepEqual(r.findings.map((f) => f.rule), ['jcenter-repository']);
  assert.match(r.notes.join('\n'), /no version catalog was found: gradle\/libs\.versions\.toml is not there/);
  const other = await reportOf(projectWith({ [T]: null, 'p/deps.versions.toml': CATALOG }), ['p', '--catalog', 'p/deps.versions.toml']);
  assert.match(other.notes.join('\n'), /gradle\/libs\.versions\.toml is not there; the catalogs read are p\/deps\.versions\.toml/);
  assert.equal(other.catalogs[0].name, 'deps');
  assert.equal(findingsOf(other, 'unused-catalog-entry').length, 7, 'the build file reads libs, not deps');
});

test('project: build, .gradle and .git are passed over, --exclude and exclude leave paths out, and the modules are named by folder', async () => {
  const files = projectWith({ 'p/app/build/x.gradle': 'repositories { jcenter() }\n', 'p/.gradle/y.gradle': 'repositories { jcenter() }\n', 'p/old/build.gradle': 'repositories { jcenter() }\n', 'p/feature/login/build.gradle.kts': 'dependencies { implementation(libs.compose.ui) }\n', 'c.json': '{"exclude": ["**/samples/**"]}', 'p/x/samples/build.gradle': 'repositories { jcenter() }\n' });
  const r = await reportOf(files, ['p', '--exclude', 'old/**', '--config', 'c.json']);
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.modules.map((m) => m.module), [':app', ':feature:login', 'settings']);
  assert.deepEqual([r.input.foldersPassedOver, r.input.excluded], [2, 2]);
  assert.deepEqual(r.input.exclude, ['**/samples/**', 'old/**']);
  assert.match(r.notes.join('\n'), /2 paths matching \*\*\/samples\/\*\* and old\/\*\* are left out/);
});

test('project: the pieces of the analysis without the command line', () => {
  const ix = new Map([['a.b', 1], ['a.b.c', 2]]);
  assert.equal(longestAccessor(['a', 'b', 'c', 'get'], ix), 2);
  assert.equal(longestAccessor(['a', 'b', 'asProvider'], ix), 1);
  assert.equal(longestAccessor(['a'], ix), null);
  assert.equal(moduleOf('build.gradle.kts'), ':');
  assert.equal(moduleOf('a/b/build.gradle'), ':a:b');
  assert.equal(moduleOf('settings.gradle', true), 'settings');
  const result = analyze({ catalogs: [{ file: 't', name: catalogNameOf(T), model: catalogOf(CATALOG) }], gradle: [{ file: 'b', rel: 'app/build.gradle.kts', settings: false, scan: scanGradle(BUILD) }], config: defaultConfig() });
  assert.deepEqual(result.findings, []);
  assert.equal(result.totals.libraries, 5);
});

test('project: rules of the default level, and the run as a whole', async () => {
  assert.deepEqual(await rulesOf(projectWith({ [B]: `${BUILD}repositories { jcenter() }\n` })), ['jcenter-repository']);
});
