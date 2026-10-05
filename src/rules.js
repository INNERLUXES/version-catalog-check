// The rules and the result. Each rule names the points of the public pages it rests on (src/data.js), says where it is
// the tool's own choice, and what to change. docs/method.md says exactly what each rule looks at and what it cannot
// see. The checks themselves are in src/project.js, the reading of a catalog in src/catalog.js and the reading of a
// Gradle file in src/gradle.js.

import { LEVELS } from './data.js';
import { grouped, listText, plural } from './size.js';

export const RULES = [
  {
    id: 'invalid-catalog-entry',
    key: 'invalidCatalogEntry',
    title: 'a catalog entry Gradle cannot read',
    basis: ['catalogTables', 'catalogForms', 'catalogAccessors'],
    own: 'a table other than versions, libraries, bundles, plugins and metadata; a library with no module and no group and name, or with a group or name that is not a coordinate; a plugin with no id; a version that is empty or not a string or a rich version; a bundle that names an alias that is not a library of the catalog; and two aliases that give the same accessor',
    rule: () => 'an entry of a version catalog that Gradle cannot read as written',
    fix: 'write the entry in one of the forms of the Gradle page on version catalogs, such as { module = "group:name", version.ref = "key" }'
  },
  {
    id: 'missing-version-ref',
    key: 'missingVersionRef',
    title: 'a version.ref names a key that [versions] does not have',
    basis: ['catalogForms', 'catalogTables'],
    own: 'a version.ref of a library or a plugin whose key is not in the [versions] table of the same catalog, compared as written',
    rule: () => 'a version.ref to a key that is not in [versions]',
    fix: 'add the key to [versions], or point version.ref at the key that holds the version'
  },
  {
    id: 'dynamic-version',
    key: 'dynamicVersion',
    title: 'a version lets Gradle pick a different version from one build to the next',
    basis: ['dynamicForms', 'dynamicUnreproducible', 'richMeaning'],
    own: 'a version that ends with + (1.+, +), starts with latest. (latest.release, latest.integration), or is a range such as [1.0,2.0) or ]1.0,2.0[, in [versions], in a library or plugin of a catalog, in a strictly, require or prefer of a rich version, or in a dependency string of a build file; a version.ref is reported once, at its key; reject is not read for this rule; -SNAPSHOT versions are not reported',
    rule: () => 'a version written with +, latest.* or as a range',
    fix: 'write the one version the build should use, such as 4.12.0, and change it on purpose when you update; if a range is needed, lock the resolved versions with Gradle dependency locking'
  },
  {
    id: 'duplicate-library',
    key: 'duplicateLibrary',
    title: 'two aliases of the catalogs name the same library',
    basis: ['catalogCentral', 'catalogForms'],
    own: 'two libraries with the same group:name in the catalogs read, under different aliases; the second is reported, with the place of the first; the same module in two catalogs counts too',
    rule: () => 'the same group:name declared under two aliases',
    fix: 'keep one alias for the library, point every build file at it, and remove the other'
  },
  {
    id: 'version-conflict',
    key: 'versionConflict',
    title: 'the same library is declared with two different versions',
    basis: ['catalogCentral', 'richMeaning'],
    own: 'one group:name written with two different versions across the catalogs and the dependency strings of the build files; a version.ref is followed to its key, a rich version stands for its strictly, else require, else prefer; dynamic versions and versions written with a variable are left out; each declaration after the first with a different version is reported, with the place of the first; which one Gradle picks depends on resolution, which the tool does not run',
    rule: () => 'one group:name with two different versions in the catalogs and build files',
    fix: 'declare the library once, in the catalog, with one version, and use the catalog accessor in every build file'
  },
  {
    id: 'deprecated-coordinate',
    key: 'deprecatedCoordinate',
    title: 'a deprecated library or plugin is still declared',
    basis: ['supportUnmaintained', 'supportMapping', 'syntheticsDeprecated'],
    own: 'a library of a catalog or a dependency string of a build file that matches deprecatedLibraries (com.android.support:*, com.android.support.*:* and android.arch.*:* by default), and a plugin of a catalog or a plugin id of a build file in deprecatedPlugins (kotlin-android-extensions by default); a library declared in a catalog is reported there, once',
    rule: (config) => `a library matching ${listText(config.deprecatedLibraries.map((d) => d.match), 4) || 'no pattern'}, or a plugin ${listText(config.deprecatedPlugins.map((d) => d.id), 3) || 'of an empty list'}`,
    fix: 'move to the replacement the message names, and remove the old coordinate or plugin'
  },
  {
    id: 'jcenter-repository',
    key: 'jcenterRepository',
    title: 'the build still reads from JCenter',
    basis: ['jcenterReadOnly', 'repositoriesDeclared'],
    own: 'a call jcenter() in a settings or build file, outside comments and strings',
    rule: () => 'jcenter() in a settings or build file',
    fix: 'replace jcenter() with mavenCentral() and check that every dependency is found there'
  },
  {
    id: 'unused-catalog-entry',
    key: 'unusedCatalogEntry',
    title: 'a catalog entry no build file uses',
    basis: ['catalogAccessors', 'catalogCentral', 'catalogNaming'],
    own: 'a library, bundle or plugin whose accessor (libs.x.y, libs.bundles.x, libs.plugins.x, with dashes, underscores and dots all read as dots) appears in no Gradle file of the project, outside comments and strings; a library counts as used when a bundle that holds it is used; references from Kotlin or Java code outside Gradle files, such as convention plugins in build-logic, are not seen',
    rule: () => 'a library, bundle or plugin of a catalog that no Gradle file references',
    fix: 'remove the entry when nothing uses it, or reference it where it is meant to be used'
  },
  {
    id: 'unused-version',
    key: 'unusedVersion',
    title: 'a key of [versions] that nothing uses',
    basis: ['catalogForms', 'catalogAccessors'],
    own: 'a key of [versions] that no version.ref of the same catalog names and that no Gradle file reads as libs.versions.x',
    rule: () => 'a key of [versions] that no version.ref and no libs.versions accessor uses',
    fix: 'remove the key, or point the library or plugin that should follow it at it with version.ref'
  },
  {
    id: 'hard-coded-dependency',
    key: 'hardCodedDependency',
    title: 'a dependency is written with its version in a build file instead of the catalog',
    basis: ['catalogCentral', 'catalogNaming'],
    own: 'a string group:name:version in a dependency configuration of a build file (implementation, api, kapt, classpath and the like, inside platform() too); the message says when a catalog already has the library; group:name with no version, the map notation (group: ..., name: ...) and project(...) are not reported',
    rule: () => 'a dependency string with a version in a build file',
    fix: 'add the library to the catalog and declare it through its accessor, such as implementation(libs.retrofit)'
  },
  {
    id: 'version-next-to-bom',
    key: 'versionNextToBom',
    title: 'a library that a BOM aligns is given a version of its own',
    basis: ['platformBom', 'composeBomUse', 'composeBomCatalog', 'firebaseBomUse', 'coroutinesBom'],
    own: 'a library of a catalog or a dependency string of a build file that matches the libraries of an entry of boms and not its except, declared with a version, while the BOM of that entry is declared somewhere in the project (in a catalog or in a build file); whether the BOM is imported as a platform in the module that uses the library is not checked',
    rule: (config) => `a library with a version next to ${listText(config.boms.map((b) => b.bom), 4) || 'no BOM'}`,
    fix: 'leave the version out and let the BOM choose it; if one library must differ on purpose, say why in a comment and set this rule to info'
  },
  {
    id: 'maven-local-repository',
    key: 'mavenLocalRepository',
    title: 'the build reads from the local Maven folder',
    basis: ['mavenLocalAvoid', 'repositoriesDeclared'],
    own: 'a call mavenLocal() in a settings or build file, outside comments and strings',
    rule: () => 'mavenLocal() in a settings or build file',
    fix: 'remove mavenLocal(); to build against a local change of a library, use a composite build (includeBuild)'
  },
  {
    id: 'kapt-processor',
    key: 'kaptProcessor',
    title: 'an annotation processor runs with kapt although it has a KSP version',
    basis: ['kaptMaintenance', 'kspLibraries'],
    own: 'a dependency in kapt or a kapt configuration of a variant (kaptTest, kaptAndroidTest) on a processor of kspProcessors, as a string or through a catalog accessor; a suggestion only, because a module may need kapt for another processor, such as data binding',
    rule: (config) => `a kapt dependency on ${listText(config.kspProcessors, 3) || 'a processor of an empty list'}`,
    fix: 'apply the KSP plugin (com.google.devtools.ksp), change kapt(...) to ksp(...), and remove the kapt plugin once no processor needs it'
  },
  {
    id: 'unreadable-file',
    key: null,
    title: 'a catalog or a Gradle file that cannot be read',
    basis: ['tomlRules', 'catalogSettings'],
    own: 'a file over its size limit, a binary file, a file that is not valid UTF-8 or UTF-16 with its byte order mark, a catalog that is not TOML the reader takes, and a catalog the settings file names from a file that is not there; nothing in it is checked; this rule cannot be set lower or off',
    rule: () => 'a catalog or Gradle file that the tool could not read',
    fix: 'save the file as UTF-8 and write the catalog as TOML, one key and value a line, with inline tables on one line'
  },
  {
    id: 'scan-limit',
    key: null,
    title: 'the input is larger than the limits of a run',
    basis: ['tomlRules'],
    own: 'a project with more files, folders, Gradle files or catalog entries than the limits of docs/limits.md, or folders nested deeper; the rest is not read, so the run fails; this rule cannot be set lower or off',
    rule: () => 'a project past a limit of the run',
    fix: 'exclude the folders that are not part of the build, or check the parts of the project in runs of their own'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at or above the level failOn. { pass, failOn, failing, byLevel, text }.
export function decide(findings, failOn) {
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const failing = findings.filter((f) => atOrAbove(f.level, failOn)).length;
  const counts = ['error', 'warning', 'info'].filter((l) => byLevel[l]).map((l) => `${grouped(byLevel[l])} ${l}`);
  const text = failing
    ? `FAIL - ${plural(failing, 'finding')} at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`
    : `PASS - no finding at or above ${failOn}${counts.length ? ` (${counts.join(', ')})` : ''}`;
  return { pass: failing === 0, failOn, failing, byLevel, text };
}
