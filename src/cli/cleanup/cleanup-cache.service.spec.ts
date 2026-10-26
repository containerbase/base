import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { INSTALL_TOOL_TOKEN } from '../install-tool/install-tool.service.ts';
import { PathService, createContainer } from '../services/index.ts';
import { logger, pathExists } from '../utils/index.ts';
import { CleanupCacheService } from './cleanup-cache.service.ts';
import { cachePath, rootPath } from '~test/path.ts';

@injectable()
@injectFromHierarchy()
abstract class TestInstallService extends BaseInstallService {
  /** Does nothing, for tests. */
  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }
}

/** a tool with a cache folder */
@injectable()
@injectFromHierarchy()
class CachingInstallService extends TestInstallService {
  override readonly name = 'caching';

  override readonly cacheDirs = ['.caching/cache', '.shared/cache'];
}

/** another tool sharing a cache folder */
@injectable()
@injectFromHierarchy()
class SharingInstallService extends TestInstallService {
  override readonly name = 'sharing';

  override readonly cacheDirs = ['.shared/cache'];
}

/** a tool without cache folders */
@injectable()
@injectFromHierarchy()
class PlainInstallService extends TestInstallService {
  override readonly name = 'plain';
}

/** Creates a file and its missing parent folders. */
async function touch(path: string): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, '');
}

describe('cli/cleanup/cleanup-cache.service', () => {
  let tmpCache: string;
  let svc: CleanupCacheService;

  beforeEach(async () => {
    tmpCache = rootPath('tmp/containerbase/cache');
    await fs.rm(rootPath('tmp'), { recursive: true, force: true });
    await fs.rm(rootPath('var/cache'), { recursive: true, force: true });
    await fs.rm(rootPath('volume'), { recursive: true, force: true });
    await fs.rm(cachePath(''), { recursive: true, force: true });
    await fs.mkdir(cachePath(''), { recursive: true });

    const container = createContainer();
    container.bind(CleanupCacheService).toSelf();
    container.bind(INSTALL_TOOL_TOKEN).to(CachingInstallService);
    container.bind(INSTALL_TOOL_TOKEN).to(SharingInstallService);
    container.bind(INSTALL_TOOL_TOKEN).to(PlainInstallService);
    svc = await container.getAsync(CleanupCacheService);
  });

  test('uses the containerbase cache', async () => {
    const pathSvc = await createContainer().getAsync(PathService);
    expect(pathSvc.cachePath).toBe(tmpCache);
  });

  test('removes the known caches and keeps the rest', async () => {
    await touch(join(tmpCache, '.caching/cache/file'));
    await touch(join(tmpCache, '.caching/config'));
    await touch(join(tmpCache, '.shared/cache/file'));
    await touch(join(tmpCache, '.cache/pip/file'));
    await touch(join(tmpCache, '.cache/.hidden'));
    await touch(join(tmpCache, '.local/share/virtualenv/file'));
    await touch(join(tmpCache, '.local/share/other'));
    await touch(cachePath('download/file'));
    // a dangling link counts as well
    await fs.symlink('missing', join(tmpCache, '.cache/link'));

    expect(await svc.cleanupCache()).toEqual([
      join(tmpCache, '.cache/.hidden'),
      join(tmpCache, '.cache/link'),
      join(tmpCache, '.cache/pip'),
      join(tmpCache, '.caching/cache'),
      join(tmpCache, '.local/share/virtualenv'),
      join(tmpCache, '.shared/cache'),
    ]);

    expect(await fs.readdir(join(tmpCache, '.cache'))).toEqual([]);
    // the download cache is left alone
    expect(await pathExists(cachePath('download/file'))).toBe(true);
    expect(await fs.readdir(join(tmpCache, '.caching'))).toEqual(['config']);
    expect(await fs.readdir(join(tmpCache, '.local/share'))).toEqual(['other']);
    expect(await pathExists(join(tmpCache, '.shared/cache'))).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith(
      { path: join(tmpCache, '.caching/cache') },
      'remove cache',
    );
  });

  test('removes the caches when the download cache is missing', async () => {
    await touch(join(tmpCache, '.cache/pip/file'));
    vi.stubEnv('CONTAINERBASE_CACHE_DIR', rootPath('missing-downloads'));

    expect(await svc.cleanupCache()).toEqual([join(tmpCache, '.cache/pip')]);
  });

  test('skips paths holding the download cache', async () => {
    await touch(join(tmpCache, '.cache/containerbase/download/file'));
    await touch(join(tmpCache, '.cache/pip/file'));
    vi.stubEnv(
      'CONTAINERBASE_CACHE_DIR',
      join(tmpCache, '.cache/containerbase/download'),
    );

    expect(await svc.cleanupCache()).toEqual([join(tmpCache, '.cache/pip')]);

    expect(
      await pathExists(join(tmpCache, '.cache/containerbase/download/file')),
    ).toBe(true);
    expect(logger.debug).toHaveBeenCalledWith(
      { path: join(tmpCache, '.cache/containerbase') },
      'cache holds the download cache',
    );

    // through a link, the download cache in the link target
    await touch(rootPath('volume/downloads/file'));
    await fs.mkdir(join(tmpCache, '.shared'), { recursive: true });
    await fs.symlink(rootPath('volume'), join(tmpCache, '.shared/cache'));
    vi.stubEnv('CONTAINERBASE_CACHE_DIR', rootPath('volume/downloads'));
    expect(await svc.cleanupCache()).toEqual([
      join(tmpCache, '.cache/containerbase'),
    ]);
    expect(await pathExists(rootPath('volume/downloads/file'))).toBe(true);
  });

  test('dry run', async () => {
    await touch(join(tmpCache, '.caching/cache/file'));

    expect(await svc.cleanupCache(true)).toEqual([
      join(tmpCache, '.caching/cache'),
    ]);

    expect(await pathExists(join(tmpCache, '.caching/cache/file'))).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      `Dry run: remove cache ${join(tmpCache, '.caching/cache')} ...`,
    );
  });

  test('works without any cache', async () => {
    expect(await svc.cleanupCache()).toEqual([]);
  });

  test('empties a linked cache folder and keeps the link', async () => {
    const volume = rootPath('volume/caching');
    await touch(join(volume, 'file'));
    await touch(join(volume, 'dir/file'));
    await touch(join(rootPath('volume/cache'), 'pip/file'));
    await fs.mkdir(join(tmpCache, '.caching'), { recursive: true });
    await fs.symlink(volume, join(tmpCache, '.caching/cache'));
    // the generic `.cache` folder is emptied through its link too
    await fs.symlink(rootPath('volume/cache'), join(tmpCache, '.cache'));

    expect(await svc.cleanupCache()).toEqual([
      join(tmpCache, '.cache/pip'),
      join(tmpCache, '.caching/cache'),
    ]);

    expect(await fs.readlink(join(tmpCache, '.caching/cache'))).toBe(volume);
    expect(await fs.readdir(volume)).toEqual([]);
    expect(await fs.readdir(rootPath('volume/cache'))).toEqual([]);
  });

  test('finds the caches in a configured tmp dir without the link', async () => {
    vi.stubEnv('CONTAINERBASE_TMP_DIR', rootPath('var/cache/containerbase'));
    await fs.mkdir(rootPath('tmp'), { recursive: true });
    await touch(rootPath('var/cache/containerbase/cache/.caching/cache/file'));

    expect(await svc.cleanupCache()).toEqual([
      join(tmpCache, '.caching/cache'),
    ]);

    expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
      rootPath('var/cache/containerbase'),
    );
    expect(
      await pathExists(
        rootPath('var/cache/containerbase/cache/.caching/cache'),
      ),
    ).toBe(false);
  });

  test('dry run reads a configured tmp dir without the link and changes nothing', async () => {
    vi.stubEnv('CONTAINERBASE_TMP_DIR', rootPath('var/cache/containerbase'));
    await fs.mkdir(rootPath('tmp'), { recursive: true });
    const cache = rootPath('var/cache/containerbase/cache');
    await touch(join(cache, '.caching/cache/file'));
    await touch(join(cache, '.cache/pip/file'));

    expect(await svc.cleanupCache(true)).toEqual([
      join(cache, '.cache/pip'),
      join(cache, '.caching/cache'),
    ]);

    expect(await fs.readdir(rootPath('tmp'))).toEqual([]);
    expect(await pathExists(join(cache, '.caching/cache/file'))).toBe(true);
    expect(await pathExists(join(cache, '.cache/pip/file'))).toBe(true);
  });

  test('dry run reads the default cache when the link exists', async () => {
    vi.stubEnv('CONTAINERBASE_TMP_DIR', rootPath('var/cache/containerbase'));
    await fs.mkdir(rootPath('tmp'), { recursive: true });
    await touch(rootPath('var/cache/containerbase/cache/.caching/cache/file'));
    await fs.symlink(
      rootPath('var/cache/containerbase'),
      rootPath('tmp/containerbase'),
    );

    expect(await svc.cleanupCache(true)).toEqual([
      join(tmpCache, '.caching/cache'),
    ]);
  });

  test('skips a linked cache folder with a missing target', async () => {
    await fs.mkdir(join(tmpCache, '.caching'), { recursive: true });
    await fs.symlink(
      rootPath('volume/missing'),
      join(tmpCache, '.caching/cache'),
    );

    expect(await svc.cleanupCache()).toEqual([]);

    expect(await fs.readlink(join(tmpCache, '.caching/cache'))).toBe(
      rootPath('volume/missing'),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { path: join(tmpCache, '.caching/cache') },
      'cache link target missing',
    );
  });

  test('does not make a link target writable', async () => {
    const target = rootPath('volume/readonly');
    await fs.mkdir(target, { recursive: true });
    await fs.chmod(target, 0o555);
    await fs.mkdir(join(tmpCache, '.cache'), { recursive: true });
    await fs.symlink(target, join(tmpCache, '.cache/link'));
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(
      Object.assign(new Error('EACCES'), { code: 'EACCES' }),
    );

    await expect(svc.cleanupCache()).rejects.toThrow(
      'Failed to remove 1 cache paths',
    );

    expect((await fs.stat(target)).mode & 0o777).toBe(0o555);
    await fs.chmod(target, 0o755);
  });

  test('makes a folder writable when it cannot be removed', async () => {
    await touch(join(tmpCache, '.caching/cache/file'));
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(
      Object.assign(new Error('EACCES'), { code: 'EACCES' }),
    );

    expect(await svc.cleanupCache()).toEqual([
      join(tmpCache, '.caching/cache'),
    ]);

    expect(await pathExists(join(tmpCache, '.caching/cache'))).toBe(false);
  });

  test('removes read-only folders', async () => {
    const dir = join(tmpCache, '.caching/cache/mod');
    await touch(join(dir, 'file'));
    await fs.chmod(dir, 0o555);

    expect(await svc.cleanupCache()).toEqual([
      join(tmpCache, '.caching/cache'),
    ]);

    expect(await pathExists(join(tmpCache, '.caching/cache'))).toBe(false);
  });

  test('removes the other paths when one fails and throws at the end', async () => {
    await touch(join(tmpCache, '.caching/cache/file'));
    await touch(join(tmpCache, '.shared/cache/file'));
    const err = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(err);

    await expect(svc.cleanupCache()).rejects.toThrow(
      'Failed to remove 1 cache paths',
    );

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { path: join(tmpCache, '.caching/cache'), err },
      'cannot remove cache',
    );
    expect(await pathExists(join(tmpCache, '.caching/cache/file'))).toBe(true);
    expect(await pathExists(join(tmpCache, '.shared/cache'))).toBe(false);
  });
});
