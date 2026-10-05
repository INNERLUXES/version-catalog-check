// A version catalog read from its TOML tables: [versions], [libraries], [bundles] and [plugins], as the Gradle page on
// version catalogs describes them. A library is "group:name:version", "group:name", or an inline table with module or
// group and name, and a version that is a string, a version.ref to a key of [versions], or a rich version with
// strictly, require, prefer and reject. A plugin is "id:version" or a table with id and a version. A bundle is a list of
// library aliases. Each entry keeps its offset, so a finding can name its line. An entry that Gradle could not read is
// an invalid-catalog-entry finding, and a version.ref to a key that is not there a missing-version-ref finding.

import { entryOf } from './toml.js';
import { richText } from './versions.js';

export const CATALOG_LIMITS = { maxCatalogEntries: 5000 };

// The four tables a catalog has, and the one Gradle also accepts for the format version.
export const CATALOG_TABLES = ['versions', 'libraries', 'bundles', 'plugins'];
const OTHER_TABLES = ['metadata'];
const RICH_KEYS = ['strictly', 'require', 'prefer', 'reject', 'rejectAll'];
const COORDINATE_PART = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const PLUGIN_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

// The accessor of an alias, as Gradle builds it: dashes, underscores and dots all separate the parts, so
// "androidx-core_ktx" and "androidx.core.ktx" are both libs.androidx.core.ktx.
export const accessorOf = (alias) => String(alias).split(/[-_.]/).filter((p) => p !== '').join('.');

// The name of a catalog from its file name: "gradle/libs.versions.toml" is libs, "deps.toml" is deps.
export function catalogNameOf(file) {
  const base = String(file).slice(String(file).lastIndexOf('/') + 1);
  if (base.endsWith('.versions.toml') && base.length > '.versions.toml'.length) return base.slice(0, -'.versions.toml'.length);
  if (base.endsWith('.toml') && base.length > '.toml'.length) return base.slice(0, -'.toml'.length);
  return base;
}

// "group:name" of a coordinate with its parts checked, or null.
export function splitModule(text) {
  const parts = String(text).split(':');
  if (parts.length !== 2 || !COORDINATE_PART.test(parts[0]) || !COORDINATE_PART.test(parts[1])) return null;
  return { group: parts[0], name: parts[1] };
}

const kindName = (node) => (node === undefined ? 'nothing' : node.kind === 'table' ? 'a table' : node.kind === 'array' ? 'a list' : node.kind === 'integer' ? 'an integer' : `a ${node.kind}`);

// Reads a catalog from the root table of its TOML. Returns { name, versions, libraries, bundles, plugins, findings }
// where findings are [{ rule, offset, found }].
export function readCatalog(root, { name = 'libs', limits = CATALOG_LIMITS } = {}) {
  const findings = [];
  const invalid = (offset, found) => findings.push({ rule: 'invalid-catalog-entry', offset, found });
  const versions = [];
  const libraries = [];
  const bundles = [];
  const plugins = [];
  let count = 0;
  let limited = false;
  const room = () => {
    count += 1;
    if (count > limits.maxCatalogEntries) {
      limited = true;
      return false;
    }
    return true;
  };

  for (const [key, node] of root.entries) {
    if (OTHER_TABLES.includes(key)) continue;
    if (!CATALOG_TABLES.includes(key)) invalid(node.keyOffset ?? node.offset, `the key "${key.slice(0, 60)}" is not a table Gradle reads in a version catalog; it reads [versions], [libraries], [bundles] and [plugins]`);
    else if (node.kind !== 'table' || node.how === 'inline') invalid(node.keyOffset ?? node.offset, `${key} is ${kindName(node)}, not a table such as [${key}]`);
  }
  const table = (key) => {
    const t = entryOf(root, key);
    return t && t.kind === 'table' && t.how !== 'inline' ? t : null;
  };

  // A version: a string, a rich version (a table of strictly, require, prefer, reject, rejectAll), or with
  // allowRef a table with ref. Returns { kind: 'plain' | 'rich' | 'ref', text, rich, ref, offset } or null.
  const readVersion = (node, where, allowRef) => {
    if (node.kind === 'string') {
      if (node.value.trim() === '') {
        invalid(node.offset, `${where} has an empty version`);
        return null;
      }
      return { kind: 'plain', text: node.value, rich: null, ref: null, offset: node.offset };
    }
    if (node.kind !== 'table') {
      invalid(node.offset, `${where} has a version that is ${kindName(node)}; write it in quotes, such as "1.2.0"`);
      return null;
    }
    const ref = node.entries.get('ref');
    if (ref !== undefined) {
      if (!allowRef) {
        invalid(ref.keyOffset ?? node.offset, `${where} uses ref inside [versions]; a version there is a string or a rich version`);
        return null;
      }
      if (ref.kind !== 'string' || ref.value === '') {
        invalid(ref.offset, `${where} has a version.ref that is ${kindName(ref)}, not the name of a key of [versions]`);
        return null;
      }
      for (const k of node.entries.keys()) if (k !== 'ref') invalid(node.entries.get(k).keyOffset ?? node.offset, `${where} has version.ref and also version.${k.slice(0, 40)}; give one of them`);
      return { kind: 'ref', text: null, rich: null, ref: ref.value, offset: ref.offset };
    }
    const rich = {};
    for (const [k, v] of node.entries) {
      if (!RICH_KEYS.includes(k)) {
        invalid(v.keyOffset ?? node.offset, `${where} has "${k.slice(0, 40)}" in its version, which is not one of ${allowRef ? 'ref, ' : ''}strictly, require, prefer, reject and rejectAll`);
        continue;
      }
      if (k === 'rejectAll') {
        if (v.kind !== 'boolean') invalid(v.offset, `${where} has a rejectAll that is not true or false`);
        else rich.rejectAll = v.value;
      } else if (k === 'reject') {
        if (v.kind !== 'array' || v.items.some((x) => x.kind !== 'string')) invalid(v.offset, `${where} has a reject that is not a list of versions in quotes`);
        else rich.reject = v.items.map((x) => x.value);
      } else if (v.kind !== 'string' || v.value.trim() === '') invalid(v.offset, `${where} has a ${k} that is not a version in quotes`);
      else rich[k] = v.value;
    }
    if (rich.strictly === undefined && rich.require === undefined && rich.prefer === undefined && !rich.rejectAll && rich.reject === undefined) {
      invalid(node.offset, `${where} has a version table with no version in it`);
      return null;
    }
    return { kind: 'rich', text: richText(rich), rich, ref: null, offset: node.offset };
  };

  const seenAccessor = new Map();
  const checkAccessor = (section, alias, offset) => {
    const accessor = accessorOf(alias);
    const key = `${section}:${accessor}`;
    if (accessor === '') invalid(offset, `the alias "${alias.slice(0, 60)}" has no letters or digits`);
    else if (seenAccessor.has(key)) invalid(offset, `the alias "${alias.slice(0, 60)}" gives the same accessor ${accessor} as "${seenAccessor.get(key).slice(0, 60)}"; Gradle maps dashes, underscores and dots to the same accessor`);
    else seenAccessor.set(key, alias);
    return accessor;
  };

  const versionsTable = table('versions');
  if (versionsTable) {
    for (const [key, node] of versionsTable.entries) {
      if (!room()) break;
      const v = readVersion(node, `the version "${key.slice(0, 60)}"`, false);
      versions.push({ key, accessor: checkAccessor('versions', key, node.keyOffset ?? node.offset), version: v, offset: node.keyOffset ?? node.offset });
    }
  }
  const versionKeys = new Map(versions.map((v) => [v.key, v]));

  // The version a library or a plugin stands for, with a version.ref followed to its key of [versions].
  const resolve = (version) => {
    if (!version) return { text: null, from: null };
    if (version.kind !== 'ref') return { text: version.text, from: null };
    const target = versionKeys.get(version.ref);
    if (!target) return { text: null, from: null, missing: true };
    return { text: target.version ? target.version.text : null, from: target };
  };

  const librariesTable = table('libraries');
  if (librariesTable) {
    for (const [alias, node] of librariesTable.entries) {
      if (!room()) break;
      const at = node.keyOffset ?? node.offset;
      const where = `the library "${alias.slice(0, 60)}"`;
      const accessor = checkAccessor('libraries', alias, at);
      let module = null;
      let version = null;
      if (node.kind === 'string') {
        const parts = node.value.split(':');
        if (parts.length < 2 || parts.length > 3) invalid(node.offset, `${where} is "${node.value.slice(0, 80)}", not group:name or group:name:version`);
        else {
          module = splitModule(`${parts[0]}:${parts[1]}`);
          if (!module) invalid(node.offset, `${where} has a group or a name with a character Gradle does not take: "${node.value.slice(0, 80)}"`);
          if (parts.length === 3) {
            if (parts[2].trim() === '') invalid(node.offset, `${where} ends with a colon and no version`);
            else version = { kind: 'plain', text: parts[2], rich: null, ref: null, offset: node.offset + parts[0].length + parts[1].length + 3 };
          }
        }
      } else if (node.kind === 'table') {
        for (const [k, v] of node.entries) if (!['module', 'group', 'name', 'version'].includes(k)) invalid(v.keyOffset ?? at, `${where} has "${k.slice(0, 40)}", which is not module, group, name or version`);
        const m = node.entries.get('module');
        const g = node.entries.get('group');
        const nm = node.entries.get('name');
        if (m !== undefined) {
          if (g !== undefined || nm !== undefined) invalid(m.keyOffset ?? at, `${where} has module and also group or name; give module, or group and name`);
          if (m.kind !== 'string' || !splitModule(m.value)) invalid(m.offset, `${where} has a module that is not "group:name"`);
          else module = splitModule(m.value);
        } else if (g !== undefined && nm !== undefined) {
          if (g.kind !== 'string' || !COORDINATE_PART.test(g.value)) invalid(g.offset, `${where} has a group that is not a group name`);
          else if (nm.kind !== 'string' || !COORDINATE_PART.test(nm.value)) invalid(nm.offset, `${where} has a name that is not an artifact name`);
          else module = { group: g.value, name: nm.value };
        } else invalid(at, `${where} has no module and no group and name, so Gradle does not know what to fetch`);
        const v = node.entries.get('version');
        if (v !== undefined) version = readVersion(v, where, true);
      } else invalid(at, `${where} is ${kindName(node)}, not "group:name:version" or an inline table`);
      libraries.push({ alias, accessor, module, version, ...resolve(version), offset: at });
    }
  }

  const pluginsTable = table('plugins');
  if (pluginsTable) {
    for (const [alias, node] of pluginsTable.entries) {
      if (!room()) break;
      const at = node.keyOffset ?? node.offset;
      const where = `the plugin "${alias.slice(0, 60)}"`;
      const accessor = checkAccessor('plugins', alias, at);
      let id = null;
      let version = null;
      if (node.kind === 'string') {
        const parts = node.value.split(':');
        if (parts.length !== 2 || !PLUGIN_ID.test(parts[0]) || parts[1].trim() === '') invalid(node.offset, `${where} is "${node.value.slice(0, 80)}", not id:version`);
        else {
          id = parts[0];
          version = { kind: 'plain', text: parts[1], rich: null, ref: null, offset: node.offset + parts[0].length + 2 };
        }
      } else if (node.kind === 'table') {
        for (const [k, v] of node.entries) if (!['id', 'version'].includes(k)) invalid(v.keyOffset ?? at, `${where} has "${k.slice(0, 40)}", which is not id or version`);
        const i = node.entries.get('id');
        if (i === undefined || i.kind !== 'string' || !PLUGIN_ID.test(i.value)) invalid(i ? i.offset : at, `${where} has no id that Gradle can read`);
        else id = i.value;
        const v = node.entries.get('version');
        if (v !== undefined) version = readVersion(v, where, true);
      } else invalid(at, `${where} is ${kindName(node)}, not "id:version" or an inline table`);
      plugins.push({ alias, accessor, id, version, ...resolve(version), offset: at });
    }
  }

  const byAccessor = new Map(libraries.map((l) => [l.accessor, l]));
  const bundlesTable = table('bundles');
  if (bundlesTable) {
    for (const [alias, node] of bundlesTable.entries) {
      if (!room()) break;
      const at = node.keyOffset ?? node.offset;
      const where = `the bundle "${alias.slice(0, 60)}"`;
      const accessor = checkAccessor('bundles', alias, at);
      const members = [];
      if (node.kind !== 'array') invalid(at, `${where} is ${kindName(node)}, not a list of library aliases`);
      else {
        for (const item of node.items) {
          if (item.kind !== 'string') invalid(item.offset, `${where} holds ${kindName(item)}, not the alias of a library in quotes`);
          else if (!byAccessor.has(accessorOf(item.value))) invalid(item.offset, `${where} names "${item.value.slice(0, 60)}", which is not a library of this catalog`);
          else members.push({ alias: item.value, library: byAccessor.get(accessorOf(item.value)), offset: item.offset });
        }
      }
      bundles.push({ alias, accessor, members, offset: at });
    }
  }

  for (const entry of [...libraries, ...plugins]) {
    if (entry.version && entry.version.kind === 'ref' && !versionKeys.has(entry.version.ref)) {
      findings.push({ rule: 'missing-version-ref', offset: entry.version.offset, found: `${entry.id === undefined ? 'the library' : 'the plugin'} "${entry.alias.slice(0, 60)}" has version.ref = "${entry.version.ref.slice(0, 60)}", but [versions] has no key ${entry.version.ref.slice(0, 60)}, so Gradle stops when it reads the catalog` });
    }
  }
  return { name, versions, libraries, bundles, plugins, findings, limited };
}
