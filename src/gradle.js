// The Gradle files of a project read as text: build.gradle and build.gradle.kts, settings.gradle and
// settings.gradle.kts, and any other *.gradle or *.gradle.kts script. The tool does not run Gradle and does not parse
// Groovy or Kotlin; it reads each file once, left to right, sets its comments and the inside of its strings apart, and
// then looks for a few forms by their shape. This is a heuristic, and docs/method.md and docs/limits.md say what it
// sees and what it misses:
//   - a reference to a catalog, such as libs.androidx.core.ktx, libs.bundles.room, libs.plugins.kotlin.android or
//     libs.versions.compileSdk, outside strings and comments;
//   - a dependency written as a string, such as implementation("group:name:version") or testImplementation 'g:n:v',
//     inside platform(...) or enforcedPlatform(...) too, when the call is a dependency configuration;
//   - a plugin id: id("..."), id '...', kotlin("..."), apply plugin: '...' and apply(plugin = "...");
//   - the repositories jcenter() and mavenLocal();
//   - in a settings file, the catalogs of dependencyResolutionManagement { versionCatalogs { ... } } that are read from
//     a file with from(files("...")).
// Nothing found in a comment or inside a string counts, so a dependency that is commented out is not reported.

const IDENT = /[A-Za-z0-9_$]/;
const IDENT_START = /[A-Za-z_]/;
const COORDINATE_PART = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

// The dependency configurations, by name and by ending: implementation, api, compileOnly, runtimeOnly and their forms
// for a source set or a variant (testImplementation, debugApi, androidTestImplementation), the annotation processors
// (annotationProcessor, kapt, ksp and their forms), classpath of a buildscript, and a few configurations of plugins
// that take dependencies. The old names compile, testCompile and provided are read too.
const CONFIGURATIONS = ['implementation', 'api', 'compileOnly', 'runtimeOnly', 'compileOnlyApi', 'annotationProcessor', 'kapt', 'ksp', 'classpath', 'coreLibraryDesugaring', 'lintChecks', 'lintPublish', 'detektPlugins', 'compile', 'testCompile', 'androidTestCompile', 'provided', 'runtime', 'testRuntime', 'wearApp'];
const ENDINGS = ['Implementation', 'Api', 'CompileOnly', 'RuntimeOnly', 'AnnotationProcessor', 'CompileOnlyApi'];
const WRAPPERS = ['platform', 'enforcedPlatform', 'testFixtures'];

export const GRADLE_LIMITS = { maxStrings: 100000, maxReferences: 100000, maxBlocks: 200 };

export function isConfigurationName(name) {
  if (typeof name !== 'string' || name === '') return false;
  if (CONFIGURATIONS.includes(name)) return true;
  for (const prefix of ['kapt', 'ksp']) if (name.startsWith(prefix) && name.length > prefix.length && /[A-Z]/.test(name[prefix.length])) return true;
  return ENDINGS.some((e) => name.length > e.length && name.endsWith(e) && /[a-z0-9]/.test(name[name.length - e.length - 1]));
}

// What the inside of a string becomes in the code: a character that is neither white space nor part of a name, so that
// looking back from a value never walks through a string.
const FILLER = String.fromCharCode(1);

// How far back a call is looked for from its argument: white space or a name longer than this is not read as a call.
const MAX_LOOK_BACK = 4096;

// The text with comments and strings set apart: { code, strings } where code is the text with every comment replaced by
// spaces and every string (quotes included) by a filler character, line ends kept, and strings is [{ value, start, end, quote }] with the
// raw text between the quotes. Line comments (//), block comments (/* */), strings in double or single quotes and in
// three double or three single quotes are read; a template ${...} inside a double-quoted string is passed over with its
// braces counted. A string or a comment that is not closed runs to the end of the text.
export function maskCode(text, limits = GRADLE_LIMITS) {
  const n = text.length;
  const out = text.split('');
  const strings = [];
  const blank = (from, to, fill = ' ') => {
    for (let k = from; k < to && k < n; k += 1) if (out[k] !== '\n' && out[k] !== '\r') out[k] = fill;
  };
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') {
      const start = i;
      while (i < n && text[i] !== '\n' && text[i] !== '\r') i += 1;
      blank(start, i);
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const start = i;
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      blank(start, i);
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      const triple = text.startsWith(c.repeat(3), i);
      const open = triple ? 3 : 1;
      i += open;
      const from = i;
      let to = n;
      while (i < n) {
        if (triple) {
          if (text.startsWith(c.repeat(3), i)) {
            to = i;
            i += 3;
            break;
          }
        } else if (text[i] === c) {
          to = i;
          i += 1;
          break;
        } else if (text[i] === '\n' || text[i] === '\r') {
          to = i;
          break;
        }
        if (text[i] === '\\' && !triple) {
          i += 2;
          continue;
        }
        if (c === '"' && text[i] === '$' && text[i + 1] === '{') {
          let depth = 0;
          while (i < n) {
            if (text[i] === '{') depth += 1;
            else if (text[i] === '}') {
              depth -= 1;
              if (depth === 0) {
                i += 1;
                break;
              }
            } else if (text[i] === '\n' && !triple) break;
            i += 1;
          }
          continue;
        }
        i += 1;
      }
      if (strings.length < limits.maxStrings) strings.push({ value: text.slice(from, Math.min(to, n)), start, end: i, quote: c });
      blank(start, i, FILLER);
      continue;
    }
    i += 1;
  }
  return { code: out.join(''), strings };
}

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';

// The position before pos with white space passed over, going back.
function backOverSpace(code, pos) {
  let j = pos;
  const stop = Math.max(0, pos - MAX_LOOK_BACK);
  while (j > stop && isSpace(code[j - 1])) j -= 1;
  return j;
}

// The identifier that ends at pos (exclusive): { name, start }, or null.
function identifierEndingAt(code, pos) {
  let j = pos;
  const stop = Math.max(0, pos - MAX_LOOK_BACK);
  while (j > stop && IDENT.test(code[j - 1])) j -= 1;
  if (j === pos || !IDENT_START.test(code[j])) return null;
  if (j > 0 && code[j - 1] === '.') return { name: code.slice(j, pos), start: j, member: true };
  return { name: code.slice(j, pos), start: j, member: false };
}

// The call a value at pos is the first argument of: implementation("...") or implementation '...'. Returns { name,
// start, paren } or null.
export function callBefore(code, pos) {
  let j = backOverSpace(code, pos);
  let paren = false;
  if (code[j - 1] === '(') {
    paren = true;
    j = backOverSpace(code, j - 1);
  }
  const id = identifierEndingAt(code, j);
  if (!id) return null;
  if (!paren && j === pos) return null;
  return { ...id, paren };
}

// The dependency configuration a value at pos is declared in, through platform(), enforcedPlatform() and
// testFixtures(): { config, platform } or null when the value is not an argument of a configuration.
export function configurationAt(code, pos) {
  let call = callBefore(code, pos);
  let platform = false;
  if (call && call.paren && WRAPPERS.includes(call.name)) {
    platform = call.name !== 'testFixtures';
    call = callBefore(code, call.start);
  }
  if (!call || call.member || !isConfigurationName(call.name)) return null;
  return { config: call.name, platform };
}

// A dependency string read as group:name[:version[:classifier]][@extension]: { group, name, module, version } or null.
export function parseCoordinate(text) {
  const value = String(text);
  if (value.length > 300 || /\s/.test(value)) return null;
  const at = value.indexOf('@');
  const main = at < 0 ? value : value.slice(0, at);
  const parts = main.split(':');
  if (parts.length < 2 || parts.length > 4) return null;
  if (!COORDINATE_PART.test(parts[0]) || !COORDINATE_PART.test(parts[1])) return null;
  if (parts.length >= 3 && parts[2] === '') return null;
  return { group: parts[0], name: parts[1], module: `${parts[0]}:${parts[1]}`, version: parts.length >= 3 ? parts[2] : null };
}

// The places where a word stands alone in the code (not part of a longer name and not after a dot).
function wordsIn(code, word) {
  const out = [];
  let from = 0;
  for (;;) {
    const at = code.indexOf(word, from);
    if (at < 0) return out;
    from = at + word.length;
    const before = at > 0 ? code[at - 1] : '';
    const after = code[at + word.length] ?? '';
    if ((before && (IDENT.test(before) || before === '.')) || (after && IDENT.test(after))) continue;
    out.push(at);
  }
}

// The references to a catalog: [{ catalog, segments, offset, config, platform }] for every name.segment.segment chain
// that starts with the name of a catalog.
export function catalogReferences(code, names, limits = GRADLE_LIMITS) {
  const out = [];
  for (const name of names) {
    for (const at of wordsIn(code, name)) {
      if (out.length >= limits.maxReferences) return out;
      const segments = [];
      let j = at + name.length;
      while (code[j] === '.' && IDENT_START.test(code[j + 1] ?? '')) {
        let k = j + 1;
        while (k < code.length && IDENT.test(code[k])) k += 1;
        segments.push(code.slice(j + 1, k));
        j = k;
      }
      if (!segments.length) continue;
      const place = configurationAt(code, at);
      out.push({ catalog: name, segments, offset: at, config: place ? place.config : null, platform: place ? place.platform : false });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

// The id of a plugin a string names, or null: id("x"), id 'x', kotlin("x") outside a dependency, apply plugin: 'x' and
// apply(plugin = "x").
function pluginIdOf(code, s) {
  const call = callBefore(code, s.start);
  if (call && !call.member && call.name === 'id') return s.value;
  if (call && !call.member && call.paren && call.name === 'kotlin') {
    const before = backOverSpace(code, call.start);
    if (code[before - 1] !== '(') return `org.jetbrains.kotlin.${s.value}`;
    return null;
  }
  const j = backOverSpace(code, s.start);
  if (code[j - 1] === ':' || code[j - 1] === '=') {
    const id = identifierEndingAt(code, backOverSpace(code, j - 1));
    if (id && id.name === 'plugin' && !id.member) {
      const before = backOverSpace(code, id.start);
      const apply = identifierEndingAt(code, before);
      if (code[before - 1] === '(' || (apply && apply.name === 'apply')) return s.value;
    }
  }
  return null;
}

// The first string that starts after pos, by binary search in the strings, which are in the order of the text.
function stringAfter(strings, pos) {
  let lo = 0;
  let hi = strings.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strings[mid].start <= pos) lo = mid + 1;
    else hi = mid;
  }
  return strings[lo] ?? null;
}

// The catalogs a settings file declares from files: [{ name, path, offset }], and those it takes from a published
// artifact: [{ name, coordinate, offset }].
export function declaredCatalogs(code, strings, limits = GRADLE_LIMITS) {
  const files = [];
  const published = [];
  for (const at of wordsIn(code, 'versionCatalogs').slice(0, 10)) {
    let open = at + 'versionCatalogs'.length;
    while (open < code.length && isSpace(code[open])) open += 1;
    if (code[open] !== '{') continue;
    let depth = 0;
    let close = code.length;
    const stack = [];
    const blocks = [];
    for (let k = open; k < code.length; k += 1) {
      if (code[k] === '{') {
        depth += 1;
        if (depth > 1 && blocks.length + stack.length < limits.maxBlocks) {
          const j = backOverSpace(code, k);
          let name = null;
          if (code[j - 1] === ')') {
            let d = 0;
            let p = j - 1;
            for (; p >= open; p -= 1) {
              if (code[p] === ')') d += 1;
              else if (code[p] === '(') {
                d -= 1;
                if (d === 0) break;
              }
            }
            const inside = stringAfter(strings, p);
            if (inside && inside.end <= j) name = inside.value;
          } else {
            const id = identifierEndingAt(code, j);
            if (id) name = id.name;
          }
          stack.push({ name, from: k, depth });
        }
      } else if (code[k] === '}') {
        if (stack.length && stack.at(-1).depth === depth) blocks.push({ ...stack.pop(), to: k });
        depth -= 1;
        if (depth === 0) {
          close = k;
          break;
        }
      }
    }
    for (const s of strings) {
      if (s.start < open || s.start > close) continue;
      const call = callBefore(code, s.start);
      if (!call || !call.paren) continue;
      const block = blocks.filter((b) => b.from < s.start && b.to > s.start).sort((a, b) => b.from - a.from)[0];
      if (!block || block.name === null) continue;
      if (call.name === 'files') {
        const outer = callBefore(code, call.start);
        if (outer && outer.name === 'from') files.push({ name: block.name, path: s.value, offset: s.start });
      } else if (call.name === 'from') published.push({ name: block.name, coordinate: s.value, offset: s.start });
    }
  }
  return { files, published };
}

// One Gradle file read as text: { references, dependencies, plugins, repositories, catalogs }.
//   references: the catalog references, as catalogReferences gives them;
//   dependencies: [{ text, group, name, module, version, offset, config, platform }] for the strings declared in a
//   dependency configuration; offset is the place of the opening quote;
//   plugins: [{ id, offset }];
//   repositories: [{ kind: 'jcenter' | 'mavenLocal', offset }];
//   catalogs: what declaredCatalogs gives, for a settings file.
export function scanGradle(text, { catalogNames = ['libs'], settings = false, limits = GRADLE_LIMITS } = {}) {
  const { code, strings } = maskCode(text, limits);
  const dependencies = [];
  const plugins = [];
  for (const s of strings) {
    const id = pluginIdOf(code, s);
    if (id !== null) {
      plugins.push({ id, offset: s.start });
      continue;
    }
    const place = configurationAt(code, s.start);
    if (!place) continue;
    const c = parseCoordinate(s.value);
    if (!c) continue;
    dependencies.push({ text: s.value, ...c, offset: s.start, config: place.config, platform: place.platform });
  }
  const repositories = [];
  for (const kind of ['jcenter', 'mavenLocal']) {
    for (const at of wordsIn(code, kind)) {
      let j = at + kind.length;
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j += 1;
      if (code[j] === '(') repositories.push({ kind, offset: at });
    }
  }
  repositories.sort((a, b) => a.offset - b.offset);
  return {
    references: catalogReferences(code, catalogNames, limits),
    dependencies,
    plugins,
    repositories,
    catalogs: settings ? declaredCatalogs(code, strings, limits) : { files: [], published: [] }
  };
}
