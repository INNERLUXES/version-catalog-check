// The checks of a project: the catalogs read by src/catalog.js and the Gradle files read by src/gradle.js, put side by
// side. A catalog entry is used when a Gradle file names its accessor; a library is declared with a version in a
// catalog or in a dependency string; a BOM is present when a catalog or a build file declares it. Each check gives
// findings [{ rule, file, offset, found }] with the offset in the file named; src/check.js turns offsets into lines.
// Nothing here reads a file, the clock or the network.

import { coordinateMatch } from './glob.js';
import { dynamicReason, isInterpolated, richParts } from './versions.js';
import { byCode, folderOf } from './words.js';

const KAPT_PLUGINS = ['kotlin-kapt', 'org.jetbrains.kotlin.kapt'];

// The accessor a chain of segments names among the accessors of one kind: the longest prefix that is an accessor, so
// libs.androidx.core.ktx.get is androidx.core.ktx. Returns the entry or null.
export function longestAccessor(segments, entries) {
  for (let k = segments.length; k >= 1; k -= 1) {
    const hit = entries.get(segments.slice(0, k).join('.'));
    if (hit) return hit;
  }
  return null;
}

// The name of the module a Gradle file belongs to: ":" for the root folder, ":app" for app/build.gradle.kts and
// ":feature:login" for feature/login/build.gradle; a settings file is "settings".
export function moduleOf(rel, settings = false) {
  if (settings) return 'settings';
  const folder = folderOf(rel);
  return folder === '.' ? ':' : `:${folder.split('/').join(':')}`;
}

const versionShown = (entry) => {
  const v = entry.version;
  if (!v) return 'no version';
  if (v.kind === 'ref') return `version.ref "${v.ref.slice(0, 60)}"${entry.text !== null && entry.text !== undefined ? ` (${entry.text.slice(0, 60)})` : ''}`;
  if (v.kind === 'rich') return `the rich version ${richParts(v.rich).map((p) => `${p.part} ${p.text.slice(0, 40)}`).join(', ') || 'with reject only'}`;
  return `version ${v.text.slice(0, 60)}`;
};

// Runs every check. catalogs: [{ file, name, model }] with model from readCatalog(); gradle: [{ file, rel, settings,
// scan }] with scan from scanGradle(); where(file, offset) names a place, such as app/build.gradle.kts:12, for a
// message that points at a second place. Returns { findings, catalogs, modules, totals }.
export function analyze({ catalogs, gradle, config, where = (file) => file }) {
  const findings = [];
  const add = (rule, file, offset, found) => findings.push({ rule, file, offset, found });

  const index = new Map();
  for (const c of catalogs) {
    if (index.has(c.name)) continue;
    index.set(c.name, {
      catalog: c,
      libraries: new Map(c.model.libraries.map((x) => [x.accessor, x])),
      bundles: new Map(c.model.bundles.map((x) => [x.accessor, x])),
      plugins: new Map(c.model.plugins.map((x) => [x.accessor, x])),
      versions: new Map(c.model.versions.map((x) => [x.accessor, x]))
    });
  }
  const used = new Set();
  const usedVersionKeys = new Set();
  const modules = [];
  const kaptRefs = [];

  for (const g of gradle) {
    const counts = { catalog: 0, hardCoded: 0, strings: 0, plugins: g.scan.plugins.length, platforms: 0 };
    for (const ref of g.scan.references) {
      const ix = index.get(ref.catalog);
      if (!ix) continue;
      const [head, ...rest] = ref.segments;
      let hit = null;
      if (head === 'plugins') {
        hit = longestAccessor(rest, ix.plugins);
        if (hit) counts.plugins += 1;
      } else if (head === 'bundles') {
        hit = longestAccessor(rest, ix.bundles);
        if (hit) counts.catalog += 1;
      } else if (head === 'versions') {
        hit = longestAccessor(rest, ix.versions);
        if (hit) usedVersionKeys.add(hit);
      } else {
        hit = longestAccessor(ref.segments, ix.libraries);
        if (hit) {
          counts.catalog += 1;
          if (ref.platform) counts.platforms += 1;
          if (ref.config && ref.config.startsWith('kapt')) kaptRefs.push({ g, ref, library: hit });
        }
      }
      if (hit) used.add(hit);
    }
    for (const d of g.scan.dependencies) {
      counts.strings += 1;
      if (d.version !== null) counts.hardCoded += 1;
      if (d.platform) counts.platforms += 1;
    }
    modules.push({ file: g.file, module: moduleOf(g.rel, g.settings), settings: g.settings, ...counts });
  }
  for (const c of catalogs) for (const b of c.model.bundles) if (used.has(b)) for (const m of b.members) used.add(m.library);
  for (const c of catalogs) for (const e of [...c.model.libraries, ...c.model.plugins]) if (e.from) usedVersionKeys.add(e.from);

  // invalid-catalog-entry and missing-version-ref come from the reading of each catalog.
  for (const c of catalogs) for (const f of c.model.findings) add(f.rule, c.file, f.offset, f.found);

  // unused-catalog-entry and unused-version.
  const unusedOf = new Map();
  for (const c of catalogs) {
    let unused = 0;
    const kinds = [['library', c.model.libraries, ''], ['bundle', c.model.bundles, 'bundles.'], ['plugin', c.model.plugins, 'plugins.']];
    for (const [kind, list, prefix] of kinds) {
      for (const e of list) {
        if (used.has(e) || e.accessor === '') continue;
        unused += 1;
        const what = kind === 'library' && e.module ? ` (${e.module.group}:${e.module.name})` : kind === 'plugin' && e.id ? ` (${e.id})` : '';
        const holder = kind === 'library' ? ', and no bundle that is used holds it' : '';
        add('unused-catalog-entry', c.file, e.offset, `the ${kind} "${e.alias.slice(0, 60)}"${what} of the catalog ${c.name} is never used: no Gradle file names ${c.name}.${prefix}${e.accessor}${holder}`);
      }
    }
    for (const v of c.model.versions) {
      if (usedVersionKeys.has(v) || v.accessor === '') continue;
      unused += 1;
      add('unused-version', c.file, v.offset, `the version "${v.key.slice(0, 60)}" of the catalog ${c.name} is never used: no version.ref names it and no Gradle file reads ${c.name}.versions.${v.accessor}`);
    }
    unusedOf.set(c, unused);
  }

  // Every library declaration: the libraries of the catalogs and the dependency strings of the Gradle files.
  const declarations = [];
  for (const c of catalogs) {
    for (const lib of c.model.libraries) {
      if (!lib.module) continue;
      const v = lib.version;
      const text = lib.text ?? null;
      declarations.push({ kind: 'catalog', file: c.file, offset: lib.offset, group: lib.module.group, name: lib.module.name, module: `${lib.module.group}:${lib.module.name}`, version: text, hasVersion: Boolean(v), shown: `the library "${lib.alias.slice(0, 60)}" of the catalog ${c.name}`, versionShown: versionShown(lib), lib });
    }
  }
  for (const g of gradle) {
    for (const d of g.scan.dependencies) {
      declarations.push({ kind: 'build', file: g.file, offset: d.offset, group: d.group, name: d.name, module: d.module, version: d.version, hasVersion: d.version !== null, shown: `the dependency "${d.text.slice(0, 120)}" in ${d.config}`, versionShown: d.version === null ? 'no version' : `version ${d.version.slice(0, 60)}`, dep: d });
    }
  }

  // dynamic-version: every version that is written, once, where it is written.
  for (const c of catalogs) {
    const report = (offset, where, text) => {
      const reason = dynamicReason(text);
      if (reason) add('dynamic-version', c.file, offset, `${where} is ${text.slice(0, 60)}: ${reason} when the build runs, so two builds of the same commit can use different versions`);
    };
    const check = (entry, where) => {
      const v = entry.version;
      if (!v || v.kind === 'ref') return;
      if (v.kind === 'plain') report(v.offset, where, v.text);
      else for (const p of richParts(v.rich)) report(v.offset, `the ${p.part} of ${where}`, p.text);
    };
    for (const v of c.model.versions) check(v, `the version "${v.key.slice(0, 60)}" of the catalog ${c.name}`);
    for (const l of c.model.libraries) check(l, `the version of the library "${l.alias.slice(0, 60)}"`);
    for (const p of c.model.plugins) check(p, `the version of the plugin "${p.alias.slice(0, 60)}"`);
  }
  for (const d of declarations) {
    if (d.kind !== 'build' || d.version === null || isInterpolated(d.version)) continue;
    const reason = dynamicReason(d.version);
    if (reason) add('dynamic-version', d.file, d.offset, `the version of ${d.shown} is ${d.version.slice(0, 60)}: ${reason} when the build runs, so two builds of the same commit can use different versions`);
  }

  // duplicate-library: the same group:name under two aliases of the catalogs.
  const firstAlias = new Map();
  for (const d of declarations) {
    if (d.kind !== 'catalog') continue;
    const first = firstAlias.get(d.module);
    if (!first) firstAlias.set(d.module, d);
    else add('duplicate-library', d.file, d.offset, `${d.shown} has the coordinates ${d.module}, as ${first.shown} does (${where(first.file, first.offset)}); a build file can use either alias`);
  }

  // version-conflict: one group:name with two versions.
  const firstVersion = new Map();
  for (const d of declarations) {
    if (d.version === null || isInterpolated(d.version) || dynamicReason(d.version)) continue;
    const first = firstVersion.get(d.module);
    if (!first) firstVersion.set(d.module, d);
    else if (first.version !== d.version) add('version-conflict', d.file, d.offset, `${d.module} has ${d.versionShown} in ${d.shown}, and ${first.versionShown} in ${first.shown} (${where(first.file, first.offset)}); which one the build gets depends on resolution`);
  }

  // deprecated-coordinate: libraries and plugins.
  for (const d of declarations) {
    const hit = config.deprecatedLibraries.find((x) => coordinateMatch(x.match, d.group, d.name));
    if (hit) add('deprecated-coordinate', d.file, d.offset, `${d.module} (${d.shown}) matches ${hit.match}, which is deprecated; use ${hit.use}`);
  }
  for (const c of catalogs) {
    for (const p of c.model.plugins) {
      const hit = p.id && config.deprecatedPlugins.find((x) => x.id === p.id);
      if (hit) add('deprecated-coordinate', c.file, p.offset, `the plugin "${p.alias.slice(0, 60)}" of the catalog ${c.name} has the id ${p.id}, which is deprecated; use ${hit.use}`);
    }
  }
  for (const g of gradle) {
    for (const p of g.scan.plugins) {
      const hit = config.deprecatedPlugins.find((x) => x.id === p.id);
      if (hit) add('deprecated-coordinate', g.file, p.offset, `the plugin ${p.id.slice(0, 80)} is deprecated; use ${hit.use}`);
    }
  }

  // jcenter-repository and maven-local-repository.
  for (const g of gradle) {
    for (const r of g.scan.repositories) {
      if (r.kind === 'jcenter') add('jcenter-repository', g.file, r.offset, 'jcenter() is a repository of this build, and JCenter is read-only and takes no new versions; a dependency that is only there cannot be updated, and Gradle deprecates jcenter()');
      else add('maven-local-repository', g.file, r.offset, 'mavenLocal() is a repository of this build: the local Maven folder differs from machine to machine, can hold modules with parts missing, and Gradle does not cache it');
    }
  }

  // hard-coded-dependency: a dependency string with a version.
  const catalogModules = new Map();
  for (const c of catalogs) for (const l of c.model.libraries) if (l.module && !catalogModules.has(`${l.module.group}:${l.module.name}`)) catalogModules.set(`${l.module.group}:${l.module.name}`, `${c.name}.${l.accessor}`);
  for (const d of declarations) {
    if (d.kind !== 'build' || d.version === null) continue;
    const inCatalog = catalogModules.get(d.module);
    add('hard-coded-dependency', d.file, d.offset, `${d.shown} is written with its version in the build file${isInterpolated(d.version) ? ' (from a variable)' : ''} instead of coming from the catalog${inCatalog ? `; the catalog already has it as ${inCatalog}` : catalogs.length ? '' : '; the project has no catalog yet'}`);
  }

  // version-next-to-bom: a library a present BOM aligns, with a version of its own.
  const present = new Set(declarations.map((d) => d.module));
  for (const b of config.boms) {
    if (!present.has(b.bom)) continue;
    for (const d of declarations) {
      if (!d.hasVersion || d.module === b.bom) continue;
      if (!b.libraries.some((p) => coordinateMatch(p, d.group, d.name)) || b.except.some((p) => coordinateMatch(p, d.group, d.name))) continue;
      add('version-next-to-bom', d.file, d.offset, `${d.shown} gives ${d.module} ${d.versionShown}, while the BOM ${b.bom} is declared in the project; a version written here overrides the one the BOM aligns`);
    }
  }

  // kapt-processor: a kapt dependency on a processor that has a KSP version.
  const ksp = new Set(config.kspProcessors);
  for (const g of gradle) {
    for (const d of g.scan.dependencies) {
      if (d.config.startsWith('kapt') && ksp.has(d.module)) add('kapt-processor', g.file, d.offset, `${d.module} runs with ${d.config}, and it also runs with KSP, which needs no Java stubs and is faster; kapt is in maintenance mode`);
    }
  }
  for (const k of kaptRefs) {
    const m = k.library.module;
    if (m && ksp.has(`${m.group}:${m.name}`)) add('kapt-processor', k.g.file, k.ref.offset, `${m.group}:${m.name} (${k.ref.catalog}.${k.library.accessor}) runs with ${k.ref.config}, and it also runs with KSP, which needs no Java stubs and is faster; kapt is in maintenance mode`);
  }

  const kapt = gradle.some((g) => g.scan.plugins.some((p) => KAPT_PLUGINS.includes(p.id))) || catalogs.some((c) => c.model.plugins.some((p) => KAPT_PLUGINS.includes(p.id) && used.has(p)));
  const boms = config.boms.filter((b) => present.has(b.bom)).map((b) => b.bom);
  const shownCatalogs = catalogs.map((c) => ({ file: c.file, name: c.name, versions: c.model.versions.length, libraries: c.model.libraries.length, bundles: c.model.bundles.length, plugins: c.model.plugins.length, unused: unusedOf.get(c) ?? 0 }));
  const sum = (key) => shownCatalogs.reduce((a, c) => a + c[key], 0);
  const totals = {
    versions: sum('versions'),
    libraries: sum('libraries'),
    bundles: sum('bundles'),
    plugins: sum('plugins'),
    unusedEntries: findings.filter((f) => f.rule === 'unused-catalog-entry').length,
    unusedVersions: findings.filter((f) => f.rule === 'unused-version').length,
    hardCoded: modules.reduce((a, m) => a + m.hardCoded, 0),
    catalogReferences: modules.reduce((a, m) => a + m.catalog, 0),
    boms,
    kapt
  };
  modules.sort((a, b) => byCode(a.file, b.file));
  return { findings, catalogs: shownCatalogs, modules, totals };
}
