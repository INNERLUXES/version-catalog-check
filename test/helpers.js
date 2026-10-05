// Shared test helpers: catalogs and Gradle projects built inline, read in memory or written into a temporary folder that
// is removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux,
// macOS and Windows. The line a test expects is found with lineOf(), which counts lines the way the tool does, so a
// test never holds a line number worked out by hand for one system only. No test reads the clock, the time zone or the
// locale.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { defaultConfig, lineStarts, main, parseToml, positionOf, readCatalog, readConfig } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'version-catalog-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// The column (from 1) of the n-th place where needle starts in text.
export const columnOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).column;

// The configuration of a configuration object, through the real reader, or the defaults.
export const configOf = (object = null) => (object === null ? defaultConfig() : readConfig(JSON.stringify(object), 'config.json'));

// A catalog read in memory: what readCatalog() gives.
export const catalogOf = (text, name = 'libs') => readCatalog(parseToml(text), { name });

export const SETTINGS = `pluginManagement {
    repositories {
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Tidewater"
include(":app")
`;

// A catalog in good order: every entry is used by BUILD, and the Compose library follows the BOM.
export const CATALOG = `[versions]
kotlin = "2.0.21"
coreKtx = "1.13.1"
composeBom = "3.2.0"
room = "2.6.1"

[libraries]
androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "coreKtx" }
compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
compose-ui = { group = "androidx.compose.ui", name = "ui" }
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }

[bundles]
room = ["room-runtime"]

[plugins]
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
`;

export const BUILD = `plugins {
    alias(libs.plugins.kotlin.android)
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.bundles.room)
    ksp(libs.room.compiler)
}
`;

export const T = 'p/gradle/libs.versions.toml';
export const B = 'p/app/build.gradle.kts';
export const S = 'p/settings.gradle.kts';

// The project in good order: the folder every test of a whole run changes.
export const PROJECT = { [S]: SETTINGS, [T]: CATALOG, [B]: BUILD };

// A text with pieces replaced: pairs of [from, to], each replaced once.
export function edit(text, ...pairs) {
  let out = text;
  for (const [from, to] of pairs) {
    if (!out.includes(from)) throw new Error(`${from} is not in the text`);
    out = out.replace(from, to);
  }
  return out;
}

// The project with some files changed or added; null takes a file out.
export function projectWith(changes = {}) {
  const out = { ...PROJECT };
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

// The project with the catalog and the build file edited.
export const catalogWith = (...pairs) => projectWith({ [T]: edit(CATALOG, ...pairs) });
export const buildWith = (...pairs) => projectWith({ [B]: edit(BUILD, ...pairs) });

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = ['p'], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// The JSON report of a folder of files, with more arguments.
export async function reportOf(files, args = ['p'], limits) {
  const r = await run(files, [...args, '--json'], limits);
  if (r.code === 2) throw new Error(r.err);
  return { ...JSON.parse(r.out), code: r.code };
}

// The findings of a report, of one rule or of all.
export const findingsOf = (r, rule) => r.findings.filter((f) => !rule || f.rule === rule);

// The rule ids of the findings of a project.
export const rulesOf = async (files, args) => (await reportOf(files, args)).findings.map((f) => f.rule);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}
