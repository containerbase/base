import fs, { chmod, readFile, rm, stat } from 'node:fs/promises';
import { platform } from 'node:os';
import { join } from 'node:path';
import type Nedb from '@seald-io/nedb';
import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { fileRights, logger, pathExists } from '../utils/index.ts';
import { DataService } from './data.service.ts';
import { PathService } from './path.service.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

/** The permission bits of the path. */
async function fstat(path: string): Promise<number> {
  const s = await stat(path);
  return s.mode & fileRights;
}

describe('cli/services/data.service', () => {
  let child!: Container;
  let svc!: DataService;
  let dataDir!: string;

  const expectedMode = platform() === 'win32' ? 0 : 0o664;

  beforeAll(async () => {
    await ensurePaths('opt/containerbase/data');
    dataDir = rootPath('opt/containerbase/data');
    await chmod(dataDir, 0o775);
  });

  beforeEach(async () => {
    child = await testContainer();
    svc = await child.getAsync(DataService);
  });

  test('works', async () => {
    expect(await fstat(dataDir)).toBe(0o775);
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');

    const db = await svc.load('test');
    expect(await fstat(db.filename)).toBe(expectedMode);
    expect(setOwner).toHaveBeenCalledExactlyOnceWith({
      path: db.filename,
      mode: 0o664,
    });

    await db.ensureIndexAsync({ fieldName: 'test' });
    expect(await fstat(db.filename)).toBe(expectedMode);

    await (db as unknown as Nedb).compactDatafileAsync();
    expect(await fstat(db.filename)).toBe(expectedMode);

    expect(await fstat(dataDir)).toBe(0o775);

    await (db as unknown as Nedb).dropDatabaseAsync();
    await expect(fstat(db.filename)).rejects.toThrowError(
      `ENOENT: no such file or directory, stat '${rootPath('/opt/containerbase/data/test.nedb')}'`,
    );
    expect(await fstat(dataDir)).toBe(0o775);
  });

  test('loads without writing when the data folder is not writable', async () => {
    // an update is appended, so the file holds two lines for one document
    const db = await svc.load<{ name: string; version: string }>('readonly');
    await db.insertAsync({ name: 'node', version: '1.0.0' });
    await db.updateAsync({ name: 'node' }, { $set: { version: '2.0.0' } });
    const content = await readFile(db.filename, 'utf8');
    expect(content.trim().split('\n')).toHaveLength(2);

    const roChild = await testContainer();
    const roSvc = await roChild.getAsync(DataService);
    const roSetOwner = vi.spyOn(
      await roChild.getAsync(PathService),
      'setOwner',
    );
    const access = vi.spyOn(fs, 'access').mockRejectedValueOnce(
      Object.assign(new Error('EROFS: read-only file system'), {
        code: 'EROFS',
      }),
    );

    const roDb = await roSvc.load<{ name: string; version: string }>(
      'readonly',
    );
    expect(access).toHaveBeenCalledWith(dataDir, fs.constants.W_OK);
    expect(await roDb.findAsync({})).toMatchObject([
      { name: 'node', version: '2.0.0' },
    ]);
    expect(await readFile(roDb.filename, 'utf8')).toBe(content);
    expect(roSetOwner).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      { file: roDb.filename },
      'opening database read-only',
    );

    // the data folder is checked once for all databases
    await roSvc.load('other');
    expect(access.mock.calls.filter(([path]) => path === dataDir)).toHaveLength(
      1,
    );

    // a writable load compacts the file again
    const rwChild = await testContainer();
    const rwDb = await (
      await rwChild.getAsync(DataService)
    ).load<{ name: string; version: string }>('readonly');
    expect(await rwDb.findAsync({})).toMatchObject([
      { name: 'node', version: '2.0.0' },
    ]);
    expect(
      (await readFile(rwDb.filename, 'utf8')).trim().split('\n'),
    ).toHaveLength(1);
  });

  test('loads read-only on request when the data folder is writable', async () => {
    const db = await svc.load<{ name: string }>('forced');
    await db.insertAsync({ name: 'node' });
    const content = await readFile(db.filename, 'utf8');
    // the file holds no index yet, nedb would append it on index creation
    expect(content.trim().split('\n')).toHaveLength(1);

    const roChild = await testContainer();
    const roSvc = await roChild.getAsync(DataService);
    const roSetOwner = vi.spyOn(
      await roChild.getAsync(PathService),
      'setOwner',
    );
    const access = vi.spyOn(fs, 'access');
    roSvc.readOnly();

    const roDb = await roSvc.load<{ name: string }>('forced');
    await roDb.ensureIndexAsync({ fieldName: 'name', unique: true });
    expect(await roDb.findAsync({ name: 'node' })).toMatchObject([
      { name: 'node' },
    ]);
    expect(await readFile(roDb.filename, 'utf8')).toBe(content);
    expect(roSetOwner).not.toHaveBeenCalled();
    // the data folder isn't checked
    expect(access).not.toHaveBeenCalledWith(dataDir, fs.constants.W_OK);
    expect(logger.debug).toHaveBeenCalledWith(
      { file: roDb.filename },
      'opening database read-only',
    );
  });

  test('keeps a read-only database without a file in memory', async () => {
    await rm(dataDir, { recursive: true });
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');
    svc.readOnly();

    const db = await svc.load<{ name: string }>('memory');
    await db.ensureIndexAsync({ fieldName: 'name', unique: true });

    expect(await db.findAsync({})).toEqual([]);
    expect(db.filename).toBe(join(dataDir, 'memory.nedb'));
    expect(await pathExists(dataDir)).toBe(false);
    expect(setOwner).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      { file: db.filename },
      'opening database read-only',
    );

    // also when only the file is missing
    await ensurePaths('opt/containerbase/data');
    await chmod(dataDir, 0o775);
    const other = await svc.load('other-memory');
    expect(await pathExists(other.filename)).toBe(false);
  });

  test('fails a read-only load when the file can not be checked', async () => {
    svc.readOnly();
    vi.spyOn(fs, 'stat').mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    // an unreadable database must not look like an empty one
    await expect(svc.load('unreadable')).rejects.toThrow(
      'EACCES: permission denied',
    );
  });

  test('loads writable when the data folder check fails otherwise', async () => {
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');
    vi.spyOn(fs, 'access').mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: no such file or directory'), {
        code: 'ENOENT',
      }),
    );

    const db = await svc.load('missing');

    expect(setOwner).toHaveBeenCalledExactlyOnceWith({
      path: db.filename,
      mode: 0o664,
    });
  });
});
