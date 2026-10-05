// Reading a file: a Gradle file, a version catalog or the configuration. Each file is opened once with O_NOFOLLOW where
// the system has it, and its type and size are taken from the open handle, so a file swapped for a link, a pipe or a
// device after it was found is refused, and a file over its limit is refused before it is read. A file is read whole
// and decoded by its byte order mark: UTF-16 little or big endian, or UTF-8 with or without one. A UTF-8 file that
// holds a null byte or bytes that are not valid UTF-8 is not read. The tool writes nothing to disk. The listing of the
// project folder is in src/walk.js.

import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const FILE_LIMITS = { maxConfigBytes: 1024 * 1024, maxFileBytes: 1024 * 1024 };

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function megabytes(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} byte`;
}

// The flags a file is opened with: read only, and not through a symbolic link where the system can refuse one.
export const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

// The whole file, or an error when it is missing, a link, not a regular file or over the limit.
export async function readBounded(path, maxBytes) {
  let handle;
  try {
    handle = await open(resolve(path), OPEN_FLAGS);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(path, 'no such file');
    if (error.code === 'ELOOP' || error.code === 'EMLINK') throw fileError(path, 'is a symbolic link, which is not followed');
    if (error.code === 'EISDIR') throw fileError(path, 'is a folder');
    throw fileError(path, `cannot be read (${error.code ?? error.message})`);
  }
  try {
    const opened = await handle.stat();
    if (opened.isDirectory()) throw fileError(path, 'is a folder');
    if (!opened.isFile()) throw fileError(path, 'not a regular file');
    if (opened.size > maxBytes) throw fileError(path, `${opened.size.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
    const buffer = Buffer.alloc(opened.size);
    let read = 0;
    while (read < opened.size) {
      const { bytesRead } = await handle.read(buffer, read, opened.size - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    return buffer.subarray(0, read);
  } finally {
    await handle.close();
  }
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown absolute,
// also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// The text of a buffer, decoded by its byte order mark (UTF-16 LE, UTF-16 BE, or UTF-8 with or without one), without
// the mark, or an error whose .reason says why it is not text. shown is the path the error names.
export function textOf(buffer, shown) {
  const b0 = buffer[0];
  const b1 = buffer[1];
  let encoding = 'utf-8';
  let start = 0;
  if (b0 === 0xff && b1 === 0xfe) {
    encoding = 'utf-16le';
    start = 2;
  } else if (b0 === 0xfe && b1 === 0xff) {
    encoding = 'utf-16be';
    start = 2;
  } else if (b0 === 0xef && b1 === 0xbb && buffer[2] === 0xbf) start = 3;
  const body = buffer.subarray(start);
  if (encoding === 'utf-8' && body.includes(0)) throw fileError(shown, 'holds binary data (a null byte); a UTF-16 file needs its byte order mark');
  if (encoding !== 'utf-8' && body.length % 2 === 1) throw fileError(shown, `is not valid ${encoding === 'utf-16le' ? 'UTF-16 LE' : 'UTF-16 BE'}: it has an odd number of bytes`);
  let text;
  try {
    if (encoding === 'utf-16be') {
      const swapped = Buffer.alloc(body.length);
      for (let i = 0; i + 1 < body.length; i += 2) {
        swapped[i] = body[i + 1];
        swapped[i + 1] = body[i];
      }
      text = new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(swapped);
    } else text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(body);
  } catch {
    throw fileError(shown, `is not valid ${encoding === 'utf-8' ? 'UTF-8' : 'UTF-16'}; save the file again as UTF-8`);
  }
  if (encoding !== 'utf-8' && text.includes(String.fromCharCode(0))) throw fileError(shown, 'holds binary data (a null character)');
  return { text, encoding };
}

// The text of a file, or an error whose .reason says why it is not read. shown is the path the error names.
export async function readText(full, shown, maxBytes) {
  const buffer = await readBounded(full, maxBytes).catch((error) => {
    throw fileError(shown, error.reason ?? error.message);
  });
  return { size: buffer.length, ...textOf(buffer, shown) };
}

// What a path named on the command line is: { full, shown, folder }, or an error when it is missing, a symbolic link or
// neither a file nor a folder. The path is looked at without following a link.
export async function inspectPath(path, base) {
  const full = resolve(base, path);
  const shown = displayPath(full, base);
  let info;
  try {
    info = await lstat(full);
  } catch (error) {
    if (error.code === 'ENOENT') throw fileError(shown, 'no such file or folder');
    throw fileError(shown, `cannot be read (${error.code ?? error.message})`);
  }
  if (info.isSymbolicLink()) throw fileError(shown, 'is a symbolic link, which is not followed; name the folder or file itself');
  if (!info.isFile() && !info.isDirectory()) throw fileError(shown, 'is not a regular file or folder');
  return { full, shown, folder: info.isDirectory() };
}

// A file named on the command line (the configuration or a catalog), read as text: { file, full, size, text }.
export async function readTextFile(path, base, maxBytes) {
  const { full, shown, folder } = await inspectPath(path, base);
  if (folder) throw fileError(shown, 'is a folder; give the file itself');
  const read = await readText(full, shown, maxBytes);
  return { file: shown, full, ...read };
}
