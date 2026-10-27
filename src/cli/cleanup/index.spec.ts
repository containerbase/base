import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { installTool } from '../install-tool/index.ts';
import {
  CacheService,
  PathService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { logger, pathExists } from '../utils/index.ts';
import { cleanupCache, cleanupDownloads, cleanupTools } from './index.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun.ts');

describe('cli/cleanup/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'tmp/containerbase/cache',
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools/v2',
      'var/lib/containerbase/tool.prep.d',
    ]);
  });

  describe('cleanupTools', () => {
    test('removes the unlinked versions', async () => {
      const verSvc = await createContainer().getAsync(VersionService);
      expect(await installTool('bun', '3.0.0')).toBeUndefined();
      expect(await installTool('bun', '3.0.1')).toBeUndefined();
      // an unlinked version with a child which has no install service
      await verSvc.addInstalled({ name: 'bun', version: '2.9.0' });
      await verSvc.addInstalled({
        name: 'bun-plugin',
        version: '1.0.0',
        parent: { name: 'bun', version: '2.9.0' },
      });

      expect(await cleanupTools(true)).toBeUndefined();
      expect(await verSvc.isInstalled({ name: 'bun', version: '3.0.0' })).toBe(
        true,
      );

      expect(await cleanupTools()).toBeUndefined();
      expect(await verSvc.isInstalled({ name: 'bun', version: '3.0.0' })).toBe(
        false,
      );
      expect(await verSvc.isInstalled({ name: 'bun', version: '3.0.1' })).toBe(
        true,
      );
      // `bun-plugin` has no install service, so its parent is kept
      expect(await verSvc.isInstalled({ name: 'bun', version: '2.9.0' })).toBe(
        true,
      );
    });

    test('a dry run does not write the databases', async () => {
      const { dataPath } = await createContainer().getAsync(PathService);
      const files = (await fs.readdir(dataPath))
        .filter((file) => file.endsWith('.nedb'))
        .map((file) => join(dataPath, file));
      /** The modification times of the database files. */
      const mtimes = (): Promise<number[]> =>
        Promise.all(files.map(async (file) => (await fs.stat(file)).mtimeMs));
      const before = await mtimes();
      // fresh modules, so the shared data service loads the databases again
      vi.resetModules();
      const services = await import('../services/index.ts');
      const setOwner = vi.spyOn(services.PathService.prototype, 'setOwner');
      const fresh = await import('./index.ts');

      expect(await fresh.cleanupTools(true)).toBeUndefined();

      expect(files).not.toEqual([]);
      expect(await mtimes()).toEqual(before);
      expect(setOwner).not.toHaveBeenCalled();
    });
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
