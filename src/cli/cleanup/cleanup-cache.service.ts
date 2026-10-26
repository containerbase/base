import fs from 'node:fs/promises';
import { join, sep } from 'node:path';
import { inject, injectable, multiInject, optional } from 'inversify';
import type { BaseInstallService } from '../install-tool/base-install.service.ts';
import { INSTALL_TOOL_TOKEN } from '../install-tool/install-tool.service.ts';
import { EnvService, PathService } from '../services/index.ts';
import { logger, spawn } from '../utils/index.ts';

/** The paths of the entries in a folder, none for a missing folder. */
async function listEntries(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir).catch(() => []);
  return entries.map((entry) => join(dir, entry));
}

/** Whether something exists at the path, also a dangling link. */
async function exists(path: string): Promise<boolean> {
  return !!(await fs.lstat(path).catch(() => null));
}

/** Whether the path, with its links resolved, is the folder or a parent of it. */
async function contains(path: string, folder: string): Promise<boolean> {
  const real = await fs.realpath(path).catch(() => null);
  return !!real && (folder === real || folder.startsWith(`${real}${sep}`));
}

/**
 * Removes a file or folder. Folders which can't be removed because of their
 * permissions, eg. the read-only go module cache, are made writable first.
 * A link is never made writable, `chmod` would change its target.
 */
async function remove(path: string): Promise<void> {
  try {
    await fs.rm(path, { recursive: true, force: true });
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== 'EACCES' ||
      (await fs.lstat(path)).isSymbolicLink()
    ) {
      throw err;
    }
    await spawn('chmod', ['-R', 'u+w', path]);
    await fs.rm(path, { recursive: true, force: true });
  }
}

/**
 * Removes a cache folder. For a link only the contents of its target are
 * removed, so a redirect, eg. to a volume, is kept.
 */
async function removeCacheDir(path: string): Promise<void> {
  if (!(await fs.lstat(path)).isSymbolicLink()) {
    await remove(path);
    return;
  }
  for (const entry of await listEntries(path)) {
    await remove(entry);
  }
}

@injectable()
export class CleanupCacheService {
  @multiInject(INSTALL_TOOL_TOKEN)
  @optional()
  private readonly toolSvcs: BaseInstallService[] = [];
  @inject(PathService)
  private readonly pathSvc!: PathService;
  @inject(EnvService)
  private readonly envSvc!: EnvService;

  /**
   * Removes the cache folders of all tools, see `BaseInstallService.cacheDirs`,
   * whether they are installed or not, the virtualenv cache and the contents
   * of the generic `.cache` folder, which is kept, as a link points to it.
   * A cache folder which is a link is emptied instead, so its target is kept,
   * a link to a missing target is skipped. Links inside `.cache` are removed.
   * The download cache is left alone, see `CacheService.evict`, also a path
   * holding it, eg. `.cache/containerbase`, is skipped.
   *
   * The cache path is linked to a configured `CONTAINERBASE_TMP_DIR` first,
   * like an install does, so caches there are found when the link is missing,
   * see `PathService.ensureTmpLink`. A dry run doesn't link, it reads the
   * configured folder then.
   *
   * A path which can't be removed is logged and the others are still removed.
   * With `dryRun` every path which would be removed is logged.
   *
   * @returns the removed paths, with `dryRun` the paths which would be removed
   * @throws when any path could not be removed
   */
  async cleanupCache(dryRun = false): Promise<string[]> {
    const cachePath = await this.findCachePath(dryRun);
    const roots = new Set(
      this.toolSvcs.flatMap((svc) =>
        svc.cacheDirs.map((dir) => join(cachePath, dir)),
      ),
    );
    roots.add(join(cachePath, '.local/share/virtualenv'));
    const paths = new Set(roots);
    for (const path of await listEntries(join(cachePath, '.cache'))) {
      paths.add(path);
    }

    const { cacheDir } = this.envSvc;
    const downloads =
      cacheDir && (await fs.realpath(cacheDir).catch(() => null));

    const removed: string[] = [];
    let failed = 0;
    for (const path of Array.from(paths).sort()) {
      if (!(await exists(path))) {
        continue;
      }
      if (downloads && (await contains(path, downloads))) {
        logger.debug({ path }, 'cache holds the download cache');
        continue;
      }
      if (roots.has(path) && !(await fs.stat(path).catch(() => null))) {
        logger.debug({ path }, 'cache link target missing');
        continue;
      }
      if (dryRun) {
        logger.info(`Dry run: remove cache ${path} ...`);
      } else {
        logger.debug({ path }, 'remove cache');
        try {
          await (roots.has(path) ? removeCacheDir(path) : remove(path));
        } catch (err) {
          logger.warn({ path, err }, 'cannot remove cache');
          failed++;
          continue;
        }
      }
      removed.push(path);
    }
    if (failed) {
      throw new Error(`Failed to remove ${failed} cache paths`);
    }
    return removed;
  }

  /**
   * The cache path, linked to a configured `CONTAINERBASE_TMP_DIR` first, see
   * `PathService.ensureTmpLink`. A dry run changes nothing, so with a
   * configured folder and a missing link it reads the cache below the
   * configured folder instead.
   */
  private async findCachePath(dryRun: boolean): Promise<string> {
    const { cachePath, defaultTmpDir, tmpDir } = this.pathSvc;
    if (!dryRun) {
      await this.pathSvc.ensureTmpLink();
      return cachePath;
    }
    if (tmpDir !== defaultTmpDir && !(await exists(defaultTmpDir))) {
      return join(tmpDir, 'cache');
    }
    return cachePath;
  }
}
