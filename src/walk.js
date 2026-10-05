// The listing of the project folder: every Gradle file (*.gradle and *.gradle.kts) below it, in the order of their paths.
// The folders build, .gradle and .git hold output, caches and history, not the build as written, so they are counted
// and passed over; so is every path that matches an exclude pattern. A symbolic link (a junction on Windows too) is
// counted and never followed, so the listing cannot leave the folder or walk a loop. The listing keeps a list of folders
// of its own, with no recursion, and stops at its limits of entries, depth and Gradle files and says so, so a run never
// passes because a part of the project was not read.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { excluded } from './glob.js';
import { asciiLower, byCode, joinPath } from './words.js';

export const WALK_LIMITS = { maxProjectEntries: 50000, maxFolderDepth: 32, maxGradleFiles: 5000 };

// The folders that are never read: build output, the Gradle cache of the project and the history of git.
export const SKIPPED_FOLDERS = ['build', '.gradle', '.git'];

// True for the name of a Gradle file: a name ending with .gradle or .gradle.kts, in any case.
export function isGradleName(name) {
  const lower = asciiLower(name);
  return (lower.endsWith('.gradle') && lower.length > '.gradle'.length) || (lower.endsWith('.gradle.kts') && lower.length > '.gradle.kts'.length);
}

// True for a settings file: settings.gradle or settings.gradle.kts.
export const isSettingsName = (name) => ['settings.gradle', 'settings.gradle.kts'].includes(asciiLower(name));

// The Gradle files below a folder: { files: [{ rel, full, name }], skipped, excluded, links, others, limit }, where rel
// is the path from the folder with forward slashes, skipped counts the folders of SKIPPED_FOLDERS passed over, and limit
// says which limit stopped the listing, or is null.
export async function walkProject(root, { exclude = [], limits = WALK_LIMITS } = {}) {
  const lim = { ...WALK_LIMITS, ...limits };
  const files = [];
  let entries = 0;
  let skipped = 0;
  let excludedCount = 0;
  let links = 0;
  let others = 0;
  let limit = null;
  const folders = [{ rel: '', full: root, depth: 0 }];
  while (folders.length && limit === null) {
    const folder = folders.pop();
    const list = await readdir(folder.full, { withFileTypes: true });
    list.sort((a, b) => byCode(a.name, b.name));
    const inner = [];
    for (const entry of list) {
      entries += 1;
      if (entries > lim.maxProjectEntries) {
        limit = `more than ${lim.maxProjectEntries.toLocaleString('en-US')} files and folders`;
        break;
      }
      const rel = joinPath(folder.rel, entry.name);
      if (entry.isSymbolicLink()) {
        links += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIPPED_FOLDERS.includes(entry.name)) skipped += 1;
        else if (excluded(exclude, rel, true)) excludedCount += 1;
        else if (folder.depth + 1 > lim.maxFolderDepth) limit = `folders nested more than ${lim.maxFolderDepth} deep, at ${rel}`;
        else inner.push({ rel, full: join(folder.full, entry.name), depth: folder.depth + 1 });
        continue;
      }
      if (!entry.isFile() || !isGradleName(entry.name)) {
        others += 1;
        continue;
      }
      if (excluded(exclude, rel)) {
        excludedCount += 1;
        continue;
      }
      if (files.length >= lim.maxGradleFiles) {
        limit = `more than ${lim.maxGradleFiles.toLocaleString('en-US')} Gradle files`;
        break;
      }
      files.push({ rel, full: join(folder.full, entry.name), name: entry.name });
    }
    for (let k = inner.length - 1; k >= 0; k -= 1) folders.push(inner[k]);
  }
  files.sort((a, b) => byCode(a.rel, b.rel));
  return { files, skipped, excluded: excludedCount, links, others, limit };
}
