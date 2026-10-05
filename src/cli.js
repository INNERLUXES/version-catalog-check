// Command line: version-catalog-check <project folder> [--catalog <file>]... [--exclude <pattern>]... [--config <file>]
// [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkProject } from './check.js';
import { defaultsAsConfig } from './config.js';
import { toCsv } from './csv.js';
import { LEVELS } from './data.js';
import { toGithub, toJson, toText } from './report.js';
import { RULES } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, json: toJson, csv: toCsv, github: toGithub };

export const USAGE = `Usage: version-catalog-check <project folder> [--catalog <file>]... [--exclude <pattern>]...
                             [--config <file>] [options]

Checks the dependency setup of a Gradle project that uses a version catalog, such as an Android app, from its files
alone. It reads gradle/libs.versions.toml, the catalogs the settings file reads from files and those named with
--catalog, and every *.gradle and *.gradle.kts file of the project as text, and reports catalog entries that no build
file uses, versions of [versions] that nothing uses, a version.ref to a key that is not there, dependencies written
with their version in a build file, dynamic versions (+, latest.*, ranges), a library declared twice or with two
versions, a version next to the BOM that aligns it, deprecated coordinates and plugins (the Support Library,
android.arch, kotlin-android-extensions), jcenter() and mavenLocal(), and kapt processors that also run with KSP, with
a summary of the catalogs and of every Gradle file. It reads build files as text, so it is a heuristic: it runs no
Gradle, fetches nothing, never says what the latest version is, reads no clock, follows no symbolic link and writes
nothing to disk. The folders build, .gradle and .git are passed over.

Options:
  --catalog <file>          a catalog to read besides gradle/libs.versions.toml and those of the settings file; its
                            name is the file name before .versions.toml; may be given more than once
  --exclude <pattern>       a path of the project to leave out, relative to it, such as legacy/** or **/samples/**;
                            may be given more than once, and adds to exclude of the configuration
  --config <file>           settings in strict JSON: rules, boms, deprecatedLibraries, deprecatedPlugins,
                            kspProcessors, exclude, minSeverity and failOn (--print-defaults shows them)
  --format <name>           text, json, csv or github (default: text); csv writes one row per finding, github writes
                            workflow commands that GitHub shows as annotations
  --json                    the same as --format json
  --min-severity <level>    the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: minSeverity of
                            the configuration, else info)
  --fail-on <level>         the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: failOn of
                            the configuration, else error)
  --explain                 show the rule, the public sources and the tool's own choice behind each finding
  --print-defaults          print the built-in configuration and exit
  --help                    show this text
  --version                 show the version

Rules: ${RULES.map((r) => `${r.id} (${r.key === null ? 'always error' : `rules.${r.key}`})`).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { project: null, catalogs: [], exclude: [], config: null, format: null, json: false, minSeverity: null, failOn: null, explain: false, printDefaults: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file or a folder');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--json') o.json = true;
    else if (a === '--print-defaults') o.printDefaults = true;
    else if (a === '--catalog') {
      if (o.catalogs.length >= LIMITS.maxCatalogs) throw new Error(`more than ${LIMITS.maxCatalogs} catalogs named`);
      o.catalogs.push(next());
    } else if (a === '--exclude') {
      if (o.exclude.length >= LIMITS.maxExcludes) throw new Error(`more than ${LIMITS.maxExcludes} exclude patterns`);
      o.exclude.push(next());
    } else if (a === '--config') o.config = once(a, o.config, next());
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file or a folder');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else {
      if (o.project !== null) throw new Error('give one project folder; check two projects in two runs');
      o.project = a;
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!o.help && !o.version && !o.printDefaults) {
    if (o.project === null) throw new Error('give the folder of the Gradle project to check, such as version-catalog-check .');
    for (const p of [o.project, ...o.catalogs, o.config].filter((x) => x !== null)) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, json, csv or github)`);
    for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${v} (${LEVELS.join(', ')})`);
    if (o.explain && (o.format === 'github' || o.format === 'csv')) throw new Error(`--explain adds the sources of each finding to the text and JSON reports; the ${o.format} format has no place for them`);
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`version-catalog-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.printDefaults) {
    io.out(`${JSON.stringify(defaultsAsConfig(), null, 2)}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkProject({ project: o.project, catalogs: o.catalogs, config: o.config, exclude: o.exclude, minSeverity: o.minSeverity, failOn: o.failOn, version: VERSION, limits: { ...LIMITS, ...(limits ?? {}) }, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`version-catalog-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`version-catalog-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.result.pass ? 0 : 1;
}
