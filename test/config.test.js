import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_BOMS, DEFAULT_DEPRECATED_LIBRARIES, DEFAULT_DEPRECATED_PLUGINS, DEFAULT_EXCLUDE, DEFAULT_KSP_PROCESSORS, DEFAULT_RULES, KEYS, defaultConfig, defaultsAsConfig, distance, isCoordinate, isCoordinatePattern, isObject, isPluginId, kindOf, pathPatternProblem, readConfig, suggestion, validateConfig } from '../src/index.js';
import { B, BUILD, PROJECT, configOf, edit, projectWith, run } from './helpers.js';

// The configuration file: every key with a good value and a bad one, unknown keys with their line and a suggestion,
// and a key named twice refused.

const problems = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  return [];
};

test('config: the defaults, and --print-defaults read back give the same configuration', () => {
  const d = defaultConfig();
  assert.deepEqual(d.rules, DEFAULT_RULES);
  assert.deepEqual(d.boms, DEFAULT_BOMS);
  assert.deepEqual(d.deprecatedLibraries, DEFAULT_DEPRECATED_LIBRARIES);
  assert.deepEqual(d.deprecatedPlugins, DEFAULT_DEPRECATED_PLUGINS);
  assert.deepEqual(d.kspProcessors, DEFAULT_KSP_PROCESSORS);
  assert.deepEqual(d.exclude, DEFAULT_EXCLUDE);
  assert.equal(d.minSeverity, 'info');
  assert.equal(d.failOn, 'error');
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null }, d);
  assert.deepEqual(Object.keys(KEYS), ['name', 'rules', 'boms', 'deprecatedLibraries', 'deprecatedPlugins', 'kspProcessors', 'exclude', 'minSeverity', 'failOn']);
  assert.deepEqual(DEFAULT_BOMS.map((b) => b.bom), ['androidx.compose:compose-bom', 'com.google.firebase:firebase-bom', 'org.jetbrains.kotlinx:kotlinx-coroutines-bom']);
  d.boms[0].libraries.push('x:y');
  assert.equal(defaultConfig().boms[0].libraries.length, 1, 'the defaults are copied, never shared');
});

test('config: every key with a good value is taken, and a list replaces its default', () => {
  const c = configOf({ name: 'Review', rules: { kaptProcessor: 'off', unusedVersion: 'error' }, boms: [{ bom: 'com.squareup.okhttp3:okhttp-bom', libraries: ['com.squareup.okhttp3:*'] }], deprecatedLibraries: [{ match: 'com.google.android.gms:play-services', use: 'the split Play services libraries' }], deprecatedPlugins: [], kspProcessors: ['com.example:proc', 'com.example:proc'], exclude: ['legacy/**'], minSeverity: 'warning', failOn: 'warning' });
  assert.equal(c.name, 'Review');
  assert.equal(c.rules.kaptProcessor, 'off');
  assert.equal(c.rules.unusedVersion, 'error');
  assert.deepEqual(c.boms, [{ bom: 'com.squareup.okhttp3:okhttp-bom', libraries: ['com.squareup.okhttp3:*'], except: [] }]);
  assert.equal(c.deprecatedLibraries.length, 1);
  assert.deepEqual(c.deprecatedPlugins, []);
  assert.deepEqual(c.kspProcessors, ['com.example:proc'], 'a name given twice is kept once');
  assert.deepEqual(c.exclude, ['legacy/**']);
  assert.equal(c.minSeverity, 'warning');
  assert.equal(c.failOn, 'warning');
});

test('config: an unknown key is an error with its line and a suggestion, at the top, in rules and in a list entry', () => {
  assert.deepEqual(problems('{\n  "failOm": "error"\n}'), ['c.json: line 2: "failOm" is not a key of the configuration; did you mean "failOn"?']);
  assert.deepEqual(problems('{\n  "rules": {\n    "dynamicVersions": "off"\n  }\n}'), ['c.json: line 3: "dynamicVersions" is not a key of rules; did you mean "dynamicVersion"?']);
  assert.deepEqual(problems('{"bom": []}'), ['c.json: line 1: "bom" is not a key of the configuration; did you mean "boms"?']);
  assert.deepEqual(problems('{\n  "boms": [\n    {"bom": "a:b", "librarys": ["a:*"]}\n  ]\n}'), ['c.json: line 3: "librarys" is not a key of boms; did you mean "libraries"?', 'c.json: line 3: boms[0] needs libraries, the patterns of the libraries the BOM aligns']);
  assert.deepEqual(problems('{"colour": 1}'), ['c.json: line 1: "colour" is not a key of the configuration']);
});

test('config: a value of the wrong kind is an error, and all problems are listed in the order of their lines', () => {
  const p = problems('{\n  "name": "",\n  "rules": {"unusedVersion": "loud", "dynamicVersion": 3},\n  "boms": [{"bom": "nocolon", "libraries": ["a b"], "except": "x"}],\n  "deprecatedLibraries": [{"match": "x", "use": ""}, 5],\n  "deprecatedPlugins": [{"id": "a b", "use": "y"}],\n  "kspProcessors": ["a:*"],\n  "exclude": ["/abs", "a\\\\b", "../up", ""],\n  "minSeverity": "fatal",\n  "failOn": null\n}');
  assert.deepEqual(p, [
    'c.json: line 2: name must be a text of 1 to 120 characters',
    'c.json: line 3: rules.unusedVersion must be one of info, warning, error, off, not "loud"',
    'c.json: line 3: rules.dynamicVersion must be one of info, warning, error, off, not 3',
    'c.json: line 4: boms[0].bom: "nocolon" is not a coordinate group:name, such as androidx.room:room-compiler',
    'c.json: line 4: boms[0].libraries[0]: "a b" is not a coordinate pattern group:name, such as com.android.support:* or androidx.compose.*:*',
    'c.json: line 4: boms[0].except must be a list, not a string',
    'c.json: line 5: deprecatedLibraries[0].match: "x" is not a coordinate pattern group:name, such as com.android.support:* or androidx.compose.*:*',
    'c.json: line 5: deprecatedLibraries[0].use must be a text of 1 to 300 characters',
    'c.json: line 5: deprecatedLibraries[1] must be an object, not a number',
    'c.json: line 6: deprecatedPlugins[0].id must be a plugin id, such as kotlin-android-extensions',
    'c.json: line 7: kspProcessors[0]: "a:*" is not a coordinate group:name, such as androidx.room:room-compiler',
    'c.json: line 8: exclude[0]: "/abs" is absolute; write it relative to the project folder',
    'c.json: line 8: exclude[1]: "a\\b" uses a backslash; write paths with forward slashes',
    'c.json: line 8: exclude[2]: "../up" leaves the project folder with ..',
    'c.json: line 8: exclude[3]: "" must be 1 to 200 characters',
    'c.json: line 9: minSeverity must be one of info, warning, error',
    'c.json: line 10: failOn must be one of info, warning, error'
  ]);
  assert.deepEqual(problems('{"rules": []}'), ['c.json: line 1: rules must be an object, not a list']);
  assert.deepEqual(problems('{"boms": {}}'), ['c.json: line 1: boms must be a list, not an object']);
  assert.deepEqual(problems('{"boms": [{"bom": "a:b", "libraries": []}]}'), ['c.json: line 1: boms[0].libraries is empty']);
  assert.deepEqual(problems('{"exclude": "x"}'), ['c.json: line 1: exclude must be a list, not a string']);
  assert.deepEqual(problems(`{"kspProcessors": ${JSON.stringify(Array(CONFIG_LIMITS.maxListEntries + 1).fill('a:b'))}}`), [`c.json: line 1: kspProcessors holds more than ${CONFIG_LIMITS.maxListEntries} entries`]);
  assert.deepEqual(problems(`{"boms": ${JSON.stringify(Array(CONFIG_LIMITS.maxListEntries + 1).fill({ bom: 'a:b', libraries: ['a:*'] }))}}`), [`c.json: line 1: boms holds more than ${CONFIG_LIMITS.maxListEntries} entries`]);
});

test('config: JSON that is not strict, a name given twice and a value that is not an object are refused', () => {
  assert.match(problems('{"failOn": "error",}')[0], /c\.json: line 1, column 20: a comma before the closing brace/);
  assert.match(problems('{"failOn": "error", "failOn": "info"}')[0], /appears twice in one object/);
  assert.match(problems('// comment\n{}')[0], /a comment; JSON has no comments/);
  assert.deepEqual(problems('[]'), ['c.json: line 1: the configuration must be a JSON object, not a list']);
  assert.throws(() => validateConfig('x'), ConfigError);
});

test('config: the suggestion and the checks of names and patterns', () => {
  assert.equal(distance('nmae', 'name'), 1);
  assert.equal(suggestion('x'.repeat(70), ['name']), '');
  assert.equal(suggestion('zzzzzz', ['name']), '');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf({}), 'an object');
  assert.ok(isObject({}) && !isObject([]));
  assert.ok(isCoordinate('androidx.room:room-compiler') && !isCoordinate('a:*') && !isCoordinate('a'));
  assert.ok(isCoordinatePattern('android.arch.*:*') && !isCoordinatePattern('a') && !isCoordinatePattern('a:b:c'));
  assert.ok(isPluginId('kotlin-android-extensions') && !isPluginId('a b') && !isPluginId('.a'));
  assert.equal(pathPatternProblem('**/build/**'), null);
  assert.match(pathPatternProblem('C:/x'), /absolute/);
  assert.match(pathPatternProblem('a\u0001'), /control character/);
});

test('config: through a run, a rule set to off gives no finding and a note, and a bad configuration stops the run with exit code 2', async () => {
  const files = projectWith({ [B]: edit(BUILD, ['dependencies {\n', 'dependencies {\n    implementation("a:b:1.0")\n']), 'c.json': '{"rules": {"hardCodedDependency": "off"}}' });
  const r = await run(files, ['p', '--config', 'c.json']);
  assert.equal(r.code, 0);
  assert.match(r.out, /findings: 0\n/);
  assert.match(r.out, /note: 1 rule is off: hard-coded-dependency\n/);
  const bad = await run({ ...PROJECT, 'c.json': '{"failon": "info"}' }, ['p', '--config', 'c.json']);
  assert.equal(bad.code, 2);
  assert.equal(bad.out, '');
  assert.match(bad.err, /^version-catalog-check: no result, the input has a problem:\n {2}c\.json: line 1: "failon" is not a key of the configuration; did you mean "failOn"\?\n$/);
  const missing = await run(PROJECT, ['p', '--config', 'none.json']);
  assert.match(missing.err, /none\.json: no such file or folder/);
  const off = await run({ ...PROJECT, 'c.json': '{"rules": {"unreadableFile": "off"}}' }, ['p', '--config', 'c.json']);
  assert.equal(off.code, 2, 'the rules of input problems have no key');
});
