import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * The pinned release of containerbase/tool-versions, updated by Renovate.
 */
const toolVersionsVersion = '1.9.1';

/**
 * Where the tool-versions data lands in the image, relative to the repository.
 */
export const toolVersionsDir =
  'dist/docker/usr/local/containerbase/tool-versions';

const baseUrl = `https://github.com/containerbase/tool-versions/releases/download/v${toolVersionsVersion}/tool-versions-${toolVersionsVersion}.tar.xz`;
const cacheDir = `node_modules/.cache/tool-versions/${toolVersionsVersion}`;

/**
 * Reads a file of the download cache, or downloads it into the cache.
 * @param url - where to download the file from
 * @param file - the path of the file in the cache
 */
async function cachedDownload(url: string, file: string): Promise<Buffer> {
  try {
    return await fs.readFile(file);
  } catch {
    // not cached yet
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download of ${url} failed: ${res.status}`);
  }
  const data = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  return data;
}

/**
 * Reads the digest of a `.sha512` file, which is a bare hex digest or a
 * `<hex>  <file name>` record.
 * @param content - the content of the `.sha512` file
 * @param fileName - the file name a record has to name
 * @throws when the record names another file
 */
export function parseChecksum(content: string, fileName: string): string {
  const [digest = '', name] = content.trim().split(/\s+/);
  // a leading `*` marks binary mode
  if (name !== undefined && name.replace(/^\*/, '') !== fileName) {
    throw new Error(`The checksum is for ${name}, not ${fileName}`);
  }
  return digest;
}

/**
 * Downloads the pinned tool-versions archive, verifies its `.sha512` and
 * extracts it into `target` as is.
 * @param target - the folder to extract into, replaced if it exists
 */
export async function installToolVersions(target: string): Promise<void> {
  const archive = await cachedDownload(baseUrl, `${cacheDir}/archive.tar.xz`);
  const expected = parseChecksum(
    (
      await cachedDownload(`${baseUrl}.sha512`, `${cacheDir}/archive.sha512`)
    ).toString('utf8'),
    `tool-versions-${toolVersionsVersion}.tar.xz`,
  );
  const actual = crypto.createHash('sha512').update(archive).digest('hex');
  if (actual !== expected) {
    // don't keep a broken download in the cache
    await fs.rm(cacheDir, { recursive: true, force: true });
    throw new Error(
      `Checksum mismatch for tool-versions ${toolVersionsVersion}: expected ${expected}, got ${actual}`,
    );
  }

  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  await run('tar', ['-xJf', `${cacheDir}/archive.tar.xz`, '-C', target]);
}
