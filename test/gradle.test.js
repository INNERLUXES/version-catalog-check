import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADLE_LIMITS, callBefore, catalogReferences, configurationAt, declaredCatalogs, isConfigurationName, maskCode, parseCoordinate, scanGradle } from '../src/index.js';
import { BUILD, lineOf } from './helpers.js';

// The Gradle files read as text: comments and strings set apart, catalog references, dependency strings, plugin ids,
// repositories and the catalogs of a settings file, in the Kotlin and the Groovy forms, each with a near miss.

const deps = (text) => scanGradle(text).dependencies.map((d) => [d.config, d.text, d.platform]);
const plugins = (text) => scanGradle(text).plugins.map((p) => p.id);
const refs = (text, names = ['libs']) => scanGradle(text, { catalogNames: names }).references.map((r) => [r.catalog, r.segments.join('.'), r.config]);

test('gradle: comments and strings are set apart, with the line ends kept', () => {
  const text = 'a // c "x"\n/* b\n"y" */ c "z" \'w\' """t\n"""\n"${libs.x("q")}"\n';
  const { code, strings } = maskCode(text);
  assert.equal(code.length, text.length);
  assert.equal(code.split('\n').length, text.split('\n').length);
  assert.ok(!code.includes('x') && !code.includes('y') && !code.includes('z'));
  assert.deepEqual(strings.map((s) => s.value), ['z', 'w', 't\n', '${libs.x("q")}']);
  assert.equal(text.slice(strings[0].start, strings[0].end), '"z"');
  assert.deepEqual(maskCode('"open\nnext').strings.map((s) => s.value), ['open'], 'a string ends at its line end');
  assert.deepEqual(maskCode('"a\\"b"').strings.map((s) => s.value), ['a\\"b']);
  assert.equal(maskCode('/* never closed').code.trim(), '');
});

test('gradle: dependency strings in Kotlin and Groovy, inside platform() too, and only in a configuration', () => {
  assert.deepEqual(deps('dependencies {\n  implementation("a:b:1.0")\n  testImplementation \'c:d:2.0\'\n  api(platform("e:f-bom:3.0"))\n  kapt "g:h:4.0"\n  debugImplementation("i:j")\n  classpath("k:l:5.0")\n}\n'), [['implementation', 'a:b:1.0', false], ['testImplementation', 'c:d:2.0', false], ['api', 'e:f-bom:3.0', true], ['kapt', 'g:h:4.0', false], ['debugImplementation', 'i:j', false], ['classpath', 'k:l:5.0', false]]);
  assert.deepEqual(deps('val x = "a:b:1.0"\nprintln("c:d:2.0")\nid("e:f:3.0")\nimplementation(project(":core"))\nimplementation("not a coordinate")\nfoo.implementation("a:b:1")\n'), [], 'a string that is not an argument of a configuration, a project and a text with spaces are not dependencies');
  assert.deepEqual(deps('// implementation("a:b:1.0")\n/* api "c:d:2" */\n'), [], 'a dependency in a comment is not read');
  assert.deepEqual(deps('implementation(\n    "a:b:1.0"\n)\n'), [['implementation', 'a:b:1.0', false]], 'the string may be on the next line');
  assert.deepEqual(deps('implementation(enforcedPlatform("a:bom:1"))\ntestImplementation(testFixtures("c:d:2"))\n'), [['implementation', 'a:bom:1', true], ['testImplementation', 'c:d:2', false]]);
});

test('gradle: the configuration names, by name and by ending', () => {
  for (const n of ['implementation', 'api', 'compileOnly', 'runtimeOnly', 'kapt', 'ksp', 'kaptTest', 'kspAndroidTest', 'annotationProcessor', 'testImplementation', 'androidTestImplementation', 'debugApi', 'releaseCompileOnly', 'coreLibraryDesugaring', 'classpath', 'compile', 'testAnnotationProcessor']) assert.ok(isConfigurationName(n), n);
  for (const n of ['', 'id', 'version', 'Implementation', 'kaptain', 'kspx', 'println', 'platform', 'files', 'api2']) assert.ok(!isConfigurationName(n), n);
});

test('gradle: a coordinate is group:name with a version, a classifier and an extension, or not one', () => {
  assert.deepEqual(parseCoordinate('a.b:c-d:1.2.3'), { group: 'a.b', name: 'c-d', module: 'a.b:c-d', version: '1.2.3' });
  assert.deepEqual(parseCoordinate('a:b'), { group: 'a', name: 'b', module: 'a:b', version: null });
  assert.equal(parseCoordinate('a:b:1.0:sources@jar').version, '1.0');
  assert.equal(parseCoordinate('a:b:$v').version, '$v');
  for (const t of ['a', ':b', 'a:', 'a:b:', 'a b:c', 'a:b:c:d:e', `a:${'b'.repeat(400)}`, 'https://x.test/a']) assert.equal(parseCoordinate(t), null, t);
});

test('gradle: catalog references with their configuration, and the names of other catalogs', () => {
  assert.deepEqual(refs(BUILD), [['libs', 'plugins.kotlin.android', null], ['libs', 'androidx.core.ktx', 'implementation'], ['libs', 'compose.bom', 'implementation'], ['libs', 'compose.ui', 'implementation'], ['libs', 'bundles.room', 'implementation'], ['libs', 'room.compiler', 'ksp']]);
  assert.deepEqual(refs('implementation libs.a.b\nval x = mylibs.c\nfoo.libs.d\n"libs.e"\n// libs.f\nlibs\nlibs.\n'), [['libs', 'a.b', 'implementation']]);
  assert.deepEqual(refs('implementation(deps.x.y)\nimplementation(libs.z)\n', ['libs', 'deps']), [['deps', 'x.y', 'implementation'], ['libs', 'z', 'implementation']]);
  assert.deepEqual(refs('compileSdk = libs.versions.compileSdk.get().toInt()\n'), [['libs', 'versions.compileSdk.get', null]]);
  assert.equal(catalogReferences('libs.a libs.b libs.c', ['libs'], { maxReferences: 2 }).length, 2);
});

test('gradle: plugin ids in every form, and kotlin() as a dependency is not a plugin', () => {
  assert.deepEqual(plugins('plugins {\n  id("com.android.application")\n  id \'kotlin-kapt\'\n  kotlin("android")\n  id("x.y") version "1.0"\n}\napply plugin: \'kotlin-android-extensions\'\napply(plugin = "org.jetbrains.kotlin.kapt")\n'), ['com.android.application', 'kotlin-kapt', 'org.jetbrains.kotlin.android', 'x.y', 'kotlin-android-extensions', 'org.jetbrains.kotlin.kapt']);
  assert.deepEqual(plugins('dependencies { implementation(kotlin("stdlib")) }\nval plugin = "x"\n'), []);
});

test('gradle: jcenter() and mavenLocal() outside comments and strings', () => {
  const text = 'repositories {\n  jcenter()\n  mavenLocal ()\n  // jcenter()\n  maven { url = uri("jcenter()") }\n}\nval jcenter = 1\nfoo.jcenter()\n';
  const r = scanGradle(text).repositories;
  assert.deepEqual(r.map((x) => [x.kind, lineOf(text.slice(0, x.offset + 1) + 'X', 'X') - 0]), [['jcenter', 2], ['mavenLocal', 3]]);
});

test('gradle: the catalogs a settings file reads from files, in Kotlin and Groovy, and those from a published artifact', () => {
  const kts = 'dependencyResolutionManagement {\n  versionCatalogs {\n    create("tools") {\n      from(files("gradle/tools.versions.toml"))\n    }\n    create("shared") { from("com.example:catalog:1.0") }\n  }\n}\n';
  const k = scanGradle(kts, { settings: true }).catalogs;
  assert.deepEqual(k.files.map((f) => [f.name, f.path]), [['tools', 'gradle/tools.versions.toml']]);
  assert.deepEqual(k.published.map((f) => [f.name, f.coordinate]), [['shared', 'com.example:catalog:1.0']]);
  const groovy = "dependencyResolutionManagement {\n  versionCatalogs {\n    deps {\n      from(files('gradle/deps.versions.toml'))\n    }\n  }\n}\n";
  const { code, strings } = maskCode(groovy);
  assert.deepEqual(declaredCatalogs(code, strings).files.map((f) => [f.name, f.path]), [['deps', 'gradle/deps.versions.toml']]);
  assert.deepEqual(scanGradle(kts).catalogs, { files: [], published: [] }, 'only a settings file is read for catalogs');
  assert.deepEqual(scanGradle('versionCatalogs\nfrom(files("x"))\n', { settings: true }).catalogs.files, [], 'a from() outside a named block is passed over');
});

test('gradle: callBefore and configurationAt read back over white space and parentheses', () => {
  const code = 'implementation ( platform ( X';
  assert.deepEqual(configurationAt(code, code.indexOf('X')), { config: 'implementation', platform: true });
  assert.equal(callBefore('X', 0), null);
  assert.equal(callBefore('a.b(X', 4).member, true);
  assert.equal(configurationAt('x.implementation(X', 17), null);
  assert.equal(GRADLE_LIMITS.maxStrings, 100000);
});
