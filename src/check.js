// A run: read the configuration, list the Gradle files of the project folder, find the catalogs (gradle/libs.versions.toml,
// the catalogs the settings file reads from files, and those named with --catalog), read each catalog and each Gradle
// file, run the checks of src/project.js and build the report of the run. A path on the command line that cannot be
// used (missing, a link, a project that is not a folder), an --exclude pattern that is not valid or a configuration with
// a problem stops the run with an InputError and no result. A file that cannot be read, and input past the limits of a
// run, are error findings of their own, so the run fails at the default level and never passes because a part of the
// input was passed over.

import { isAbsolute, relative, resolve, sep } from 'node:path';
import { CATALOG_LIMITS, catalogNameOf, readCatalog } from './catalog.js';
import { ConfigError, defaultConfig, pathPatternProblem, readConfig } from './config.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { FILE_LIMITS, inspectPath, readText, readTextFile } from './files.js';
import { GRADLE_LIMITS, scanGradle } from './gradle.js';
import { lineStarts, positionOf } from './json.js';
import { analyze } from './project.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';
import { TOML_LIMITS, TomlError, parseToml } from './toml.js';
import { WALK_LIMITS, isSettingsName, walkProject } from './walk.js';
import { byCode, joinPath } from './words.js';

export const LIMITS = { ...FILE_LIMITS, ...WALK_LIMITS, ...TOML_LIMITS, ...GRADLE_LIMITS, ...CATALOG_LIMITS, maxCatalogs: 20, maxFindingsPerRule: 500, maxExcludes: 100 };
export const MAX_PROBLEMS = 20;
export const DEFAULT_CATALOG = 'gradle/libs.versions.toml';

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

// The level of a rule under a configuration: the rules of input problems are always errors.
export function levelOf(rule, config) {
  return rule.key === null ? 'error' : config.rules[rule.key];
}

// The line and column of every offset of a text.
export function placer(text) {
  const starts = lineStarts(text);
  return (offset) => positionOf(starts, Math.max(0, Math.min(offset, text.length)));
}

// True when a full path is inside a folder (or is the folder).
export function inside(folder, full) {
  const rel = relative(folder, full);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

// Reads one catalog: { model, place, problem } where problem is an unreadable-file finding { offset, found } when the
// file cannot be read as a catalog.
export async function readCatalogFile(full, shown, name, lim = LIMITS) {
  let text;
  try {
    ({ text } = await readText(full, shown, lim.maxFileBytes));
  } catch (error) {
    return { model: null, place: () => ({ line: 1, column: 1 }), problem: { offset: 0, found: `the catalog cannot be read: ${error.reason ?? error.message}; nothing in it is checked` } };
  }
  const place = placer(text);
  try {
    const model = readCatalog(parseToml(text, lim), { name, limits: lim });
    return { model, place, problem: null };
  } catch (error) {
    if (error instanceof TomlError) return { model: null, place, problem: { offset: error.offset, found: `the catalog cannot be read as TOML: ${error.reason}; nothing in it is checked` } };
    throw error;
  }
}

// The run as a report object.
export function buildReport({ input, catalogs, modules, summary, raw, config, minSeverity, failOn, version, notes: extraNotes = [], limits = LIMITS }) {
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const level = (id) => levelOf(RULES.find((r) => r.id === id), config);
  const all = raw
    .filter((f) => level(f.rule) !== 'off')
    .map((f) => ({ ...f, level: level(f.rule) }))
    .sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || byCode(a.file, b.file) || a.line - b.line || a.column - b.column || ruleOrder.get(a.rule) - ruleOrder.get(b.rule));
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) {
      cut += 1;
      continue;
    }
    const rule = RULES.find((r) => r.id === f.rule);
    findings.push({
      rule: f.rule,
      level: f.level,
      file: safeText(f.file),
      line: f.line,
      column: f.column,
      at: `${safeText(f.file)}:${f.line}`,
      found: safeText(f.found, 800),
      fix: rule.fix,
      basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })),
      own: rule.own
    });
  }
  const result = decide(shown, failOn);
  const shownModules = modules.map((m) => {
    const byLevel = { error: 0, warning: 0, info: 0 };
    for (const x of all) if (x.file === m.file) byLevel[x.level] += 1;
    return { file: safeText(m.file), module: safeText(m.module, 200), read: m.read, catalog: m.catalog, hardCoded: m.hardCoded, strings: m.strings, plugins: m.plugins, platforms: m.platforms, byLevel };
  });
  const rules = RULES.map((r) => ({ id: r.id, level: level(r.id), findings: all.filter((f) => f.rule === r.id).length }));
  const notes = [];
  if (!catalogs.length) notes.push(`no version catalog was found: ${DEFAULT_CATALOG} is not there, the settings file reads none from a file, and none was named with --catalog`);
  if (!modules.length) notes.push('the project holds no Gradle file');
  if (input.links) notes.push(`${plural(input.links, 'symbolic link')} ${input.links === 1 ? 'is' : 'are'} not followed`);
  notes.push(...extraNotes);
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown`);
  const off = RULES.filter((r) => r.key !== null && levelOf(r, config) === 'off');
  if (off.length) notes.push(`${plural(off.length, 'rule')} ${off.length === 1 ? 'is' : 'are'} off: ${off.map((r) => r.id).join(', ')}`);
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  return {
    tool: 'version-catalog-check',
    version,
    input: { ...input, project: safeText(input.project), exclude: input.exclude.map((p) => safeText(p, 200)) },
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      boms: config.boms,
      deprecatedLibraries: config.deprecatedLibraries,
      deprecatedPlugins: config.deprecatedPlugins,
      kspProcessors: config.kspProcessors,
      exclude: config.exclude,
      minSeverity,
      failOn,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: levelOf(r, config), rule: safeText(r.rule(config), 600) }))
    },
    catalogs: catalogs.map((c) => ({ ...c, file: safeText(c.file), name: safeText(c.name, 120) })),
    modules: shownModules,
    summary,
    rules,
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut, gradleFiles: modules.length, catalogs: catalogs.length },
    result,
    notes: notes.map((n) => safeText(n, 600)),
    notice: NOTICE
  };
}

// Reads the inputs, runs every check and builds the report object of the run.
export async function checkProject({ project, catalogs: catalogPaths = [], config: configPath = null, exclude = [], minSeverity = null, failOn = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  const lim = { ...LIMITS, ...limits };
  let config;
  try {
    if (configPath) {
      const c = await readTextFile(configPath, base, lim.maxConfigBytes);
      config = readConfig(c.text, c.file);
    } else config = defaultConfig();
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  const problems = [];
  let root = null;
  try {
    root = await inspectPath(project, base);
    if (!root.folder) problems.push(`${root.shown}: is a file; give the folder of the Gradle project, the one that holds settings.gradle or settings.gradle.kts`);
  } catch (error) {
    problems.push(error.message);
  }
  for (const p of exclude) {
    const problem = pathPatternProblem(p);
    if (problem) problems.push(`--exclude "${p.slice(0, 80)}" ${problem}`);
  }
  const named = [];
  for (const p of catalogPaths) {
    try {
      const info = await inspectPath(p, base);
      if (info.folder) problems.push(`--catalog ${info.shown}: is a folder; give the .versions.toml file`);
      else if (named.some((x) => x.full === info.full)) problems.push(`--catalog ${info.shown}: is named twice`);
      else named.push(info);
    } catch (error) {
      problems.push(`--catalog ${error.message}`);
    }
  }
  if (problems.length) throw new InputError(capped(problems));

  const patterns = [...new Set([...config.exclude, ...exclude])];
  const shownOf = (rel) => joinPath(root.shown, rel);
  const walked = await walkProject(root.full, { exclude: patterns, limits: lim });
  const raw = [];
  const notes = [];
  const places = new Map();
  const at = (rule, file, place, offset, found) => raw.push({ rule, file, ...place(offset), found });
  if (walked.limit) raw.push({ rule: 'scan-limit', file: root.shown, line: 1, column: 1, found: `the project holds ${walked.limit}; the listing stopped there, and the rest of the project is not read` });

  // The settings files at the top of the project, read first for the catalogs they declare.
  const settings = walked.files.filter((f) => !f.rel.includes('/') && isSettingsName(f.name));
  const declared = [];
  const published = [];
  for (const s of settings) {
    try {
      const { text } = await readText(s.full, shownOf(s.rel), lim.maxFileBytes);
      const scan = scanGradle(text, { settings: true, limits: lim });
      for (const d of scan.catalogs.files) declared.push({ ...d, settings: s, place: placer(text) });
      for (const d of scan.catalogs.published) published.push({ ...d, settings: s });
    } catch {
      // read again below with the other files, where the problem becomes a finding
    }
  }

  // The catalogs: the default file, the files the settings declare, and those named with --catalog.
  const wanted = [];
  const defaultFull = resolve(root.full, DEFAULT_CATALOG);
  let hasDefault = false;
  try {
    const info = await inspectPath(defaultFull, base);
    if (!info.folder) {
      hasDefault = true;
      wanted.push({ full: info.full, shown: info.shown, name: 'libs', how: 'default' });
    }
  } catch (error) {
    if (!/no such file or folder/.test(error.message)) raw.push({ rule: 'unreadable-file', file: shownOf(DEFAULT_CATALOG), line: 1, column: 1, found: `the catalog cannot be read: ${error.reason ?? error.message}; nothing in it is checked` });
  }
  for (const d of declared) {
    const full = resolve(root.full, d.path);
    const where = d.place(d.offset);
    if (!inside(root.full, full)) {
      raw.push({ rule: 'unreadable-file', file: shownOf(d.settings.rel), ...where, found: `the catalog ${d.name} is read from "${d.path.slice(0, 120)}", outside the project folder; the tool reads nothing outside the folder it is given, so name it with --catalog` });
      continue;
    }
    if (wanted.some((w) => w.full === full)) continue;
    try {
      const info = await inspectPath(full, base);
      if (info.folder) throw Object.assign(new Error('is a folder'), { reason: 'is a folder' });
      wanted.push({ full: info.full, shown: info.shown, name: d.name, how: 'settings' });
    } catch (error) {
      raw.push({ rule: 'unreadable-file', file: shownOf(d.settings.rel), ...where, found: `the settings file reads the catalog ${d.name} from "${d.path.slice(0, 120)}", which cannot be read: ${error.reason ?? error.message}` });
    }
  }
  for (const info of named) {
    if (wanted.some((w) => w.full === info.full)) continue;
    wanted.push({ full: info.full, shown: info.shown, name: catalogNameOf(info.shown), how: 'named' });
  }
  for (const p of published) notes.push(`the settings file takes the catalog ${p.name} from the published artifact ${p.coordinate.slice(0, 120)}, which the tool does not fetch; name a local copy with --catalog to check it`);
  const names = new Set();
  const catalogs = [];
  for (const w of wanted.slice(0, lim.maxCatalogs)) {
    if (names.has(w.name)) {
      notes.push(`two catalogs are named ${w.name}; ${w.shown} is read, and its accessors are matched to the first one`);
    }
    names.add(w.name);
    const r = await readCatalogFile(w.full, w.shown, w.name, lim);
    places.set(w.shown, r.place);
    if (r.problem) {
      at('unreadable-file', w.shown, r.place, r.problem.offset, r.problem.found);
      continue;
    }
    if (r.model.limited) raw.push({ rule: 'scan-limit', file: w.shown, line: 1, column: 1, found: `the catalog holds more than ${grouped(lim.maxCatalogEntries)} entries; the rest are not read` });
    catalogs.push({ file: w.shown, name: w.name, how: w.how, model: r.model });
  }
  if (wanted.length > lim.maxCatalogs) raw.push({ rule: 'scan-limit', file: root.shown, line: 1, column: 1, found: `more than ${lim.maxCatalogs} catalogs are named; the first ${lim.maxCatalogs} are read` });

  // Every Gradle file, scanned with the names of the catalogs.
  const catalogNames = [...new Set(catalogs.map((c) => c.name))];
  const gradle = [];
  const unread = [];
  for (const f of walked.files) {
    const shown = shownOf(f.rel);
    try {
      const { text } = await readText(f.full, shown, lim.maxFileBytes);
      const place = placer(text);
      places.set(shown, place);
      const isSettings = !f.rel.includes('/') && isSettingsName(f.name);
      gradle.push({ file: shown, rel: f.rel, settings: isSettings, scan: scanGradle(text, { catalogNames, settings: isSettings, limits: lim }) });
    } catch (error) {
      raw.push({ rule: 'unreadable-file', file: shown, line: 1, column: 1, found: `the Gradle file cannot be read: ${error.reason ?? error.message}; nothing in it is checked` });
      unread.push({ file: shown, rel: f.rel });
    }
  }

  const where = (file, offset) => `${file}:${(places.get(file) ?? (() => ({ line: 1 })))(offset).line}`;
  const analysis = analyze({ catalogs, gradle, config, where });
  for (const f of analysis.findings) at(f.rule, f.file, places.get(f.file) ?? (() => ({ line: 1, column: 1 })), f.offset, f.found);
  const modules = [...analysis.modules.map((m) => ({ ...m, read: true })), ...unread.map((u) => ({ file: u.file, module: '-', settings: false, read: false, catalog: 0, hardCoded: 0, strings: 0, plugins: 0, platforms: 0 }))].sort((a, b) => byCode(a.file, b.file));

  if (!hasDefault && catalogs.length) notes.push(`${DEFAULT_CATALOG} is not there; the catalogs read are ${listText(catalogs.map((c) => c.file), 5)}`);
  if (walked.excluded) notes.push(`${plural(walked.excluded, 'path')} matching ${listText(patterns, 5)} ${walked.excluded === 1 ? 'is' : 'are'} left out`);
  if (walked.skipped) notes.push(`${plural(walked.skipped, 'folder')} named build, .gradle or .git ${walked.skipped === 1 ? 'is' : 'are'} passed over`);
  if (gradle.length && !settings.length) notes.push('the project folder has no settings.gradle or settings.gradle.kts at its top; give the folder of the whole build');
  return buildReport({
    input: { project: root.shown, gradleFiles: walked.files.length, settingsFiles: settings.length, catalogs: catalogs.length, otherFiles: walked.others, foldersPassedOver: walked.skipped, excluded: walked.excluded, links: walked.links, exclude: patterns },
    catalogs: analysis.catalogs.map((c) => ({ ...c, how: catalogs.find((x) => x.file === c.file).how })),
    modules,
    summary: analysis.totals,
    raw,
    config,
    minSeverity: minSeverity ?? config.minSeverity,
    failOn: failOn ?? config.failOn,
    version,
    notes,
    limits: lim
  });
}
