import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { logger, pathExists } from '../utils/index.ts';
import { CacheService, fillLevel } from './cache.service.ts';
import { EnvService } from './env.service.ts';
import { createContainer } from './index.ts';
import { rootPath } from '~test/path.ts';

/** Creates a file with the modification time in seconds. */
async function touch(path: string, mtime: number): Promise<void> {
  await fs.mkdir(join(path, '..'), { recursive: true });
  await fs.writeFile(path, '');
  await fs.utimes(path, mtime, mtime);
}

describe('cli/services/cache.service', () => {
  let dir: string;
  let svc: CacheService;

  beforeEach(async () => {
    dir = rootPath('download-cache');
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    vi.spyOn(EnvService.prototype, 'cacheDir', 'get').mockReturnValue(dir);
    vi.spyOn(EnvService.prototype, 'maxAllocatedDisk', 'get').mockReturnValue(
      50,
    );
    svc = await createContainer().getAsync(CacheService);
  });

  test.each([
    { blocks: 100, bfree: 40, bavail: 30, expected: 67 },
    { blocks: 100, bfree: 100, bavail: 100, expected: 0 },
    { blocks: 0, bfree: 0, bavail: 0, expected: 0 },
  ])('fillLevel $blocks $bfree $bavail', ({ expected, ...stats }) => {
    expect(fillLevel(stats)).toBe(expected);
  });

  test('getFillLevel', async () => {
    const level = await svc.getFillLevel(dir);
    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThanOrEqual(100);
  });

  test('does nothing without a cache dir', async () => {
    vi.spyOn(EnvService.prototype, 'cacheDir', 'get').mockReturnValue(null);
    const spy = vi.spyOn(CacheService.prototype, 'getFillLevel');

    expect(await svc.evict()).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  test('does nothing with a missing cache dir', async () => {
    await fs.rm(dir, { recursive: true });

    expect(await svc.evict()).toEqual([]);
  });

  test('does nothing below the fill level', async () => {
    await touch(join(dir, 'a'), 1000);
    vi.spyOn(CacheService.prototype, 'getFillLevel').mockResolvedValue(49);

    expect(await svc.evict()).toEqual([]);
    expect(await pathExists(join(dir, 'a'))).toBe(true);
  });

  test('removes the oldest files until below the fill level', async () => {
    await touch(join(dir, 'c'), 1000);
    await touch(join(dir, 'b/test'), 2000);
    await touch(join(dir, 'b/other'), 3000);
    await touch(join(dir, 'd/e/test'), 4000);
    await touch(join(dir, 'a'), 5000);
    vi.spyOn(CacheService.prototype, 'getFillLevel')
      .mockResolvedValueOnce(90)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(70)
      .mockResolvedValueOnce(60)
      .mockResolvedValueOnce(30);

    expect(await svc.evict()).toEqual([
      join(dir, 'c'),
      join(dir, 'b/test'),
      join(dir, 'b/other'),
      join(dir, 'd/e/test'),
    ]);

    expect(logger.info).toHaveBeenCalledWith(
      `Cache: 90% - Cleaning up: ${join(dir, 'c')}`,
    );
    // emptied folders are removed, the cache folder is kept
    expect(await fs.readdir(dir)).toEqual(['a']);
  });

  test('removes all files when the disk stays full', async () => {
    // the same age is ordered by path
    await touch(join(dir, 'b'), 1000);
    await touch(join(dir, 'a'), 1000);
    vi.spyOn(CacheService.prototype, 'getFillLevel').mockResolvedValue(100);

    expect(await svc.evict()).toEqual([join(dir, 'a'), join(dir, 'b')]);

    expect(await fs.readdir(dir)).toEqual([]);
  });

  test('skips a file which cannot be removed and warns once below the fill level', async () => {
    await touch(join(dir, 'a'), 1000);
    await touch(join(dir, 'b/test'), 2000);
    await touch(join(dir, 'c'), 3000);
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(err);
    vi.spyOn(CacheService.prototype, 'getFillLevel')
      .mockResolvedValueOnce(90)
      .mockResolvedValueOnce(30);

    expect(await svc.evict()).toEqual([join(dir, 'b/test')]);

    expect(logger.warn).toHaveBeenCalledWith(
      { file: join(dir, 'a'), err },
      'cannot remove cached file',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Skipped 1 cached files which could not be removed',
    );
    // the next oldest file is removed instead, then the disk has room
    expect((await fs.readdir(dir)).sort()).toEqual(['a', 'c']);
  });

  test('throws when files cannot be removed and the disk stays full', async () => {
    await touch(join(dir, 'a'), 1000);
    await touch(join(dir, 'b'), 2000);
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(err);
    vi.spyOn(CacheService.prototype, 'getFillLevel').mockResolvedValue(90);

    await expect(svc.evict()).rejects.toThrow(
      'Failed to remove 1 cached files',
    );

    expect(await fs.readdir(dir)).toEqual(['a']);
  });

  test('dry run logs only the oldest file', async () => {
    await touch(join(dir, 'b'), 2000);
    await touch(join(dir, 'a'), 1000);
    vi.spyOn(CacheService.prototype, 'getFillLevel').mockResolvedValue(90);

    expect(await svc.evict(true)).toEqual([join(dir, 'a')]);

    expect(logger.info).toHaveBeenCalledExactlyOnceWith(
      `Dry run: Cache: 90% - Cleaning up: ${join(dir, 'a')}`,
    );
    expect((await fs.readdir(dir)).sort()).toEqual(['a', 'b']);
  });
});
