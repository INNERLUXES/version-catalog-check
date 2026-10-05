// The configuration file: the settings of the tool, in one strict JSON object over the built-in defaults. Every key the
// tool does not know is an error with its line and a suggestion, so a typo cannot leave a default in place unnoticed;
// the JSON reader refuses a name given twice in one object. The configuration is optional: with none, the defaults
// apply.

import { LEVELS } from './data.js';
import { DEFAULT_BOMS, DEFAULT_DEPRECATED_LIBRARIES, DEFAULT_DEPRECATED_PLUGINS, DEFAULT_EXCLUDE, DEFAULT_FAIL_ON, DEFAULT_KSP_PROCESSORS, DEFAULT_MIN_SEVERITY, DEFAULT_RULES } from './defaults.js';
import { MAX_PATTERN_LENGTH } from './glob.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { asciiLower } from './words.js';

export const CONFIG_LIMITS = { maxListEntries: 100 };

// Every key of the configuration file, with the kind of its value. docs/inputs.md describes each of them.
export const KEYS = {
  name: 'text',
  rules: Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, 'level or off'])),
  boms: { bom: 'group:name', libraries: 'list of coordinate patterns', except: 'list of coordinate patterns' },
  deprecatedLibraries: { match: 'coordinate pattern', use: 'text' },
  deprecatedPlugins: { id: 'plugin id', use: 'text' },
  kspProcessors: 'list of group:name',
  exclude: 'list of path patterns',
  minSeverity: 'level',
  failOn: 'level'
};

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The edit distance of two short names, for a suggestion: an insertion, a deletion, a change or two neighbours swapped
// ("nmae" for "name") each count one.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The closest of the known names, when it is close enough to be a typo: '; did you mean "..."?' or nothing. A name that
// differs in length from a known name by more than three characters, or that is longer than 64 characters, is not
// compared with it.
export function suggestion(name, known) {
  if (name.length > 64) return '';
  let best = null;
  for (const k of known) {
    if (Math.abs(name.length - k.length) > 3 || k.length > 64) continue;
    const d = distance(asciiLower(name), asciiLower(k));
    if (d <= Math.max(1, Math.floor(k.length / 3)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? `; did you mean "${best.k}"?` : '';
}

export function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A coordinate group:name, with no wildcard.
export const isCoordinate = (text) => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}:[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/.test(text);

// A coordinate pattern group:name, where * stands for any run of characters in a part.
export const isCoordinatePattern = (text) => /^[A-Za-z0-9_.*-]{1,200}:[A-Za-z0-9_.*-]{1,200}$/.test(text);

// A plugin id, such as org.jetbrains.kotlin.kapt or kotlin-android-extensions.
export const isPluginId = (text) => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/.test(text);

// A path pattern relative to the project folder, with forward slashes, that does not leave the folder.
export function pathPatternProblem(text) {
  if (text.length === 0 || text.length > MAX_PATTERN_LENGTH) return `must be 1 to ${MAX_PATTERN_LENGTH} characters`;
  if (text.includes('\\')) return 'uses a backslash; write paths with forward slashes';
  if (text.startsWith('/') || /^[A-Za-z]:/.test(text)) return 'is absolute; write it relative to the project folder';
  if (text.split('/').includes('..')) return 'leaves the project folder with ..';
  if (/[\x00-\x1f\x7f]/.test(text)) return 'holds a control character';
  return null;
}

// The built-in configuration, as the checks use it.
export function defaultConfig() {
  return {
    file: null,
    name: null,
    rules: { ...DEFAULT_RULES },
    boms: DEFAULT_BOMS.map((b) => ({ bom: b.bom, libraries: [...b.libraries], except: [...b.except] })),
    deprecatedLibraries: DEFAULT_DEPRECATED_LIBRARIES.map((d) => ({ ...d })),
    deprecatedPlugins: DEFAULT_DEPRECATED_PLUGINS.map((d) => ({ ...d })),
    kspProcessors: [...DEFAULT_KSP_PROCESSORS],
    exclude: [...DEFAULT_EXCLUDE],
    minSeverity: DEFAULT_MIN_SEVERITY,
    failOn: DEFAULT_FAIL_ON
  };
}

// The built-in configuration written as a configuration file, for --print-defaults. Read back, it gives the defaults.
export function defaultsAsConfig() {
  const d = defaultConfig();
  return { name: 'built-in defaults', rules: d.rules, boms: d.boms, deprecatedLibraries: d.deprecatedLibraries, deprecatedPlugins: d.deprecatedPlugins, kspProcessors: d.kspProcessors, exclude: d.exclude, minSeverity: d.minSeverity, failOn: d.failOn };
}

// Checks a parsed configuration and builds the configuration the checks use, or throws ConfigError with every problem.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const lineOf = (path) => {
    for (let p = path, prev = null; p && p !== prev; prev = p, p = p.replace(/(?:\.[^.[]+|\[\d+\])$/, '')) if (lines.has(p)) return lines.get(p);
    return 1;
  };
  const fail = (path, message) => problems.push({ line: lineOf(path), text: `${file}: line ${lineOf(path)}: ${message}` });
  const config = defaultConfig();
  config.file = file;
  if (!isObject(value)) throw new ConfigError([`${file}: line 1: the configuration must be a JSON object, not ${kindOf(value)}`]);
  const show = (v) => (typeof v === 'string' ? `"${v.slice(0, 40)}"` : kindOf(v));

  const top = Object.keys(KEYS);
  for (const k of Object.keys(value)) if (!top.includes(k)) fail(k, `"${k.slice(0, 60)}" is not a key of the configuration${suggestion(k, top)}`);

  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || value.name.trim().length === 0 || value.name.length > 120) fail('name', 'name must be a text of 1 to 120 characters');
    else config.name = value.name;
  }

  if (Object.hasOwn(value, 'rules')) {
    const v = value.rules;
    const keys = Object.keys(DEFAULT_RULES);
    const levels = [...LEVELS, 'off'];
    if (!isObject(v)) fail('rules', `rules must be an object, not ${kindOf(v)}`);
    else {
      for (const k of Object.keys(v)) {
        const path = `rules.${k}`;
        if (!keys.includes(k)) fail(path, `"${k.slice(0, 60)}" is not a key of rules${suggestion(k, keys)}`);
        else if (typeof v[k] !== 'string' || !levels.includes(v[k])) fail(path, `${path} must be one of ${levels.join(', ')}, not ${typeof v[k] === 'number' ? String(v[k]) : show(v[k])}`);
        else config.rules[k] = v[k];
      }
    }
  }

  // A list of texts, each checked; null when the list itself is not usable.
  const textList = (path, list, check) => {
    if (!Array.isArray(list)) {
      fail(path, `${path} must be a list, not ${kindOf(list)}`);
      return null;
    }
    if (list.length > CONFIG_LIMITS.maxListEntries) {
      fail(path, `${path} holds more than ${CONFIG_LIMITS.maxListEntries} entries`);
      return null;
    }
    const out = [];
    list.forEach((x, i) => {
      const p = `${path}[${i}]`;
      if (typeof x !== 'string') fail(p, `${p} must be a text, not ${kindOf(x)}`);
      else if (check(x)) fail(p, `${p}: ${check(x)}`);
      else if (!out.includes(x)) out.push(x);
    });
    return out;
  };
  const coordinatePattern = (x) => (isCoordinatePattern(x) ? null : `"${x.slice(0, 60)}" is not a coordinate pattern group:name, such as com.android.support:* or androidx.compose.*:*`);
  const coordinate = (x) => (isCoordinate(x) ? null : `"${x.slice(0, 60)}" is not a coordinate group:name, such as androidx.room:room-compiler`);
  const useText = (x) => (typeof x === 'string' && x.trim().length > 0 && x.length <= 300 ? null : 'must be a text of 1 to 300 characters');

  // A list of objects with known keys, each checked by read; the list replaces the default.
  const objectList = (key, fields, read) => {
    if (!Object.hasOwn(value, key)) return;
    const list = value[key];
    if (!Array.isArray(list)) {
      fail(key, `${key} must be a list, not ${kindOf(list)}`);
      return;
    }
    if (list.length > CONFIG_LIMITS.maxListEntries) {
      fail(key, `${key} holds more than ${CONFIG_LIMITS.maxListEntries} entries`);
      return;
    }
    const out = [];
    list.forEach((x, i) => {
      const p = `${key}[${i}]`;
      if (!isObject(x)) {
        fail(p, `${p} must be an object, not ${kindOf(x)}`);
        return;
      }
      let ok = true;
      for (const k of Object.keys(x)) {
        if (!fields.includes(k)) {
          fail(`${p}.${k}`, `"${k.slice(0, 60)}" is not a key of ${key}${suggestion(k, fields)}`);
          ok = false;
        }
      }
      const entry = read(x, p);
      if (ok && entry) out.push(entry);
    });
    config[key] = out;
  };

  objectList('boms', ['bom', 'libraries', 'except'], (x, p) => {
    let ok = true;
    if (typeof x.bom !== 'string' || coordinate(x.bom)) {
      fail(`${p}.bom`, typeof x.bom === 'string' ? `${p}.bom: ${coordinate(x.bom)}` : `${p}.bom must be the coordinate of the BOM, group:name`);
      ok = false;
    }
    const libraries = Object.hasOwn(x, 'libraries') ? textList(`${p}.libraries`, x.libraries, coordinatePattern) : (fail(p, `${p} needs libraries, the patterns of the libraries the BOM aligns`), null);
    const except = Object.hasOwn(x, 'except') ? textList(`${p}.except`, x.except, coordinatePattern) : [];
    if (Array.isArray(x.libraries) && x.libraries.length === 0) {
      fail(`${p}.libraries`, `${p}.libraries is empty`);
      ok = false;
    }
    return ok && libraries && except ? { bom: x.bom, libraries, except } : null;
  });
  objectList('deprecatedLibraries', ['match', 'use'], (x, p) => {
    let ok = true;
    if (typeof x.match !== 'string' || coordinatePattern(x.match)) {
      fail(`${p}.match`, typeof x.match === 'string' ? `${p}.match: ${coordinatePattern(x.match)}` : `${p}.match must be a coordinate pattern group:name`);
      ok = false;
    }
    if (useText(x.use)) {
      fail(`${p}.use`, `${p}.use ${useText(x.use)}`);
      ok = false;
    }
    return ok ? { match: x.match, use: x.use } : null;
  });
  objectList('deprecatedPlugins', ['id', 'use'], (x, p) => {
    let ok = true;
    if (typeof x.id !== 'string' || !isPluginId(x.id)) {
      fail(`${p}.id`, `${p}.id must be a plugin id, such as kotlin-android-extensions`);
      ok = false;
    }
    if (useText(x.use)) {
      fail(`${p}.use`, `${p}.use ${useText(x.use)}`);
      ok = false;
    }
    return ok ? { id: x.id, use: x.use } : null;
  });

  if (Object.hasOwn(value, 'kspProcessors')) {
    const list = textList('kspProcessors', value.kspProcessors, coordinate);
    if (list) config.kspProcessors = list;
  }
  if (Object.hasOwn(value, 'exclude')) {
    const list = textList('exclude', value.exclude, (x) => {
      const problem = pathPatternProblem(x);
      return problem ? `"${x.slice(0, 60)}" ${problem}` : null;
    });
    if (list) config.exclude = list;
  }

  for (const key of ['minSeverity', 'failOn']) {
    if (!Object.hasOwn(value, key)) continue;
    if (!LEVELS.includes(value[key])) fail(key, `${key} must be one of ${LEVELS.join(', ')}`);
    else config[key] = value[key];
  }
  // The problems in the order of their lines, so the list reads like the file.
  if (problems.length) throw new ConfigError(problems.sort((a, b) => a.line - b.line).map((p) => p.text));
  return config;
}

// Reads the text of a configuration file.
export function readConfig(text, file) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 4 });
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([`${file}: ${jsonProblem(error, text)}`]);
    throw error;
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
