import type { StatsFs } from 'node:fs';
import fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { inject, injectable } from 'inversify';
import { logger, pathExists } from '../utils/index.ts';
import { EnvService } from './env.service.ts';

/**
 * The used space of a file system in percent, rounded up, like
 * `df --output=pcent`. Blocks reserved for root count as neither used nor
 * available. An empty file system is `0`.
 */
export function fillLevel({
  blocks,
  bfree,
  bavail,
}: Pick<StatsFs, 'blocks' | 'bfree' | 'bavail'>): number {
  const used = blocks - bfree;
  const total = used + bavail;
  return total ? Math.ceil((used * 100) / total) : 0;
}

/** All files below the folder, the oldest first, by modification time. */
async function listFilesByAge(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return { path, mtime: (await fs.stat(path)).mtimeMs };
      }),
  );
  return files
    .sort((a, b) => a.mtime - b.mtime || a.path.localeCompare(b.path))
    .map(({ path }) => path);
}

/**
 * Removes the folders above the file which are left empty, up to but not
 * including `root`. Stops at the first folder which can't be removed, eg.
 * because it's not empty.
 */
async function removeEmptyParents(file: string, root: string): Promise<void> {
  // the file is below `root`, so its parents end there
  for (let dir = dirname(file); dir !== root; dir = dirname(dir)) {
    try {
      await fs.rmdir(dir);
    } catch {
      return;
    }
  }
}

@injectable()
export class CacheService {
  @inject(EnvService)
  private readonly envSvc!: EnvService;

  /**
   * Removes the oldest files from the download cache in
   * `CONTAINERBASE_CACHE_DIR`, while the file system holding it is filled to
   * `CONTAINERBASE_MAX_ALLOCATED_DISK` percent or more. Folders left empty
   * are removed too, the cache folder itself is kept. Does nothing when the
   * cache folder is not set or missing. Concurrent writes to the cache are
   * not supported.
   *
   * A file which can't be removed, eg. a root owned one when running as the
   * user, is logged and skipped, the next oldest one is removed instead. Once
   * the fill level is below the limit, the skipped files only give a warning.
   *
   * With `dryRun` nothing is removed, so the fill level doesn't change, and
   * only the oldest file, which would be removed first, is logged.
   *
   * @returns the removed files, with `dryRun` the file which would be removed
   * first
   * @throws when files could not be removed and the fill level is still at or
   * above the limit, after trying all files
   */
  async evict(dryRun = false): Promise<string[]> {
    const cacheDir = this.envSvc.cacheDir;
    if (!cacheDir || !(await pathExists(cacheDir, 'dir'))) {
      return [];
    }
    // without trailing slashes, to compare it with the parents of the files
    const dir = resolve(cacheDir);
    const max = this.envSvc.maxAllocatedDisk;
    let level = await this.getFillLevel(dir);
    const removed: string[] = [];
    let failed = 0;
    if (level < max) {
      return removed;
    }
    for (const file of await listFilesByAge(dir)) {
      if (dryRun) {
        logger.info(`Dry run: Cache: ${level}% - Cleaning up: ${file}`);
        removed.push(file);
        break;
      }
      logger.info(`Cache: ${level}% - Cleaning up: ${file}`);
      try {
        await fs.rm(file);
      } catch (err) {
        // eg. a root owned file when running as the user
        logger.warn({ file, err }, 'cannot remove cached file');
        failed++;
        continue;
      }
      await removeEmptyParents(file, dir);
      removed.push(file);
      level = await this.getFillLevel(dir);
      if (level < max) {
        break;
      }
    }
    if (failed) {
      if (level >= max) {
        throw new Error(`Failed to remove ${failed} cached files`);
      }
      logger.warn(`Skipped ${failed} cached files which could not be removed`);
    }
    return removed;
  }

  /** The fill level of the file system holding the path, see `fillLevel`. */
  async getFillLevel(path: string): Promise<number> {
    return fillLevel(await fs.statfs(path));
  }
}
