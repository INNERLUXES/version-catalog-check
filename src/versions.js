// Versions as Gradle writes them: a plain version such as 1.9.0, and the forms that let Gradle pick a version when the
// build runs, which the Gradle page on declaring versions lists: a prefix such as 1.+ or +, the status versions
// latest.release and latest.integration, and ranges such as [1.0,2.0) or ]1.0,2.0[. A rich version holds strictly,
// require, prefer and reject. Nothing here looks up a version: the tool never says what the latest version is.

export const MAX_VERSION_LENGTH = 128;

// Why a version is dynamic or open, or null when it names one version. Empty text is not dynamic.
export function dynamicReason(version) {
  if (typeof version !== 'string' || version === '') return null;
  const v = version.trim();
  if (v.endsWith('+')) return v === '+' ? 'the version + takes the newest version there is' : `the prefix version ${v} takes the newest version that starts with ${v.slice(0, -1)}`;
  if (v.startsWith('latest.')) return `the status version ${v} takes the newest version with that status`;
  const first = v[0];
  const last = v.at(-1);
  if ('[]('.includes(first) && '[])'.includes(last) && v.includes(',')) return `the range ${v} takes the newest version inside it`;
  return null;
}

// True when a version text is written with a variable, such as $kotlinVersion or ${libs.x}, so its value is not in the
// file.
export const isInterpolated = (version) => typeof version === 'string' && version.includes('$');

// The version a rich version stands for when two declarations are compared: strictly, else require, else prefer.
export function richText(rich) {
  if (!rich) return null;
  return rich.strictly ?? rich.require ?? rich.prefer ?? null;
}

// The parts of a rich version that Gradle resolves against, with their names: strictly, require and prefer. reject
// lists versions that are never taken, so it is not one of them.
export function richParts(rich) {
  if (!rich) return [];
  return ['strictly', 'require', 'prefer'].filter((k) => typeof rich[k] === 'string').map((k) => ({ part: k, text: rich[k] }));
}
