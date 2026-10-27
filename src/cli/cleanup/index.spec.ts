import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { CacheService } from '../services/index.ts';
import { logger, pathExists } from '../utils/index.ts';
import { cleanupCache, cleanupDownloads } from './index.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

describe('cli/cleanup/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp/containerbase/cache',
      'usr/local/containerbase/tools/v2',
      'var/lib/containerbase',
    ]);
  });

  describe('cleanupCache', () => {
    test('removes the caches of the registered tools', async () => {
      const cache = rootPath('tmp/containerbase/cache/.cargo/registry');
      await fs.mkdir(cache, { recursive: true });

      const dryRun = await cleanupCache(true);
      expect(dryRun).toContain(cache);
      expect(await pathExists(cache)).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        `Dry run: would remove ${dryRun.length} cache paths`,
      );

      const removed = await cleanupCache();
      expect(removed).toContain(cache);
      expect(await pathExists(cache)).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(
        `Removed ${removed.length} cache paths`,
      );
    });

    test('removes the pnpm store and keeps the global pnpm folder', async () => {
      const pnpm = rootPath('tmp/containerbase/cache/.local/share/pnpm');
      await fs.mkdir(join(pnpm, 'store/v10'), { recursive: true });
      await fs.mkdir(join(pnpm, 'global'), { recursive: true });

      expect(await cleanupCache()).toContain(join(pnpm, 'store'));

      expect(await fs.readdir(pnpm)).toEqual(['global']);
    });
  });

  describe('cleanupDownloads', () => {
    test('evicts the download cache', async () => {
      const spy = vi
        .spyOn(CacheService.prototype, 'evict')
        .mockResolvedValue(['/cache/a']);

      expect(await cleanupDownloads(true)).toEqual(['/cache/a']);
      expect(spy).toHaveBeenCalledExactlyOnceWith(true);
      // the dry run file is logged by `evict` already
      expect(logger.info).not.toHaveBeenCalled();

      expect(await cleanupDownloads()).toEqual(['/cache/a']);
      expect(logger.info).toHaveBeenCalledExactlyOnceWith(
        'Removed 1 downloads',
      );
    });

    test('logs when there is nothing to evict', async () => {
      vi.spyOn(CacheService.prototype, 'evict').mockResolvedValue([]);

      expect(await cleanupDownloads()).toEqual([]);
      expect(logger.info).toHaveBeenCalledExactlyOnceWith('Nothing to evict');
    });
  });
});
