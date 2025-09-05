import { chmod, stat } from 'node:fs/promises';
import { platform } from 'node:os';
import type Nedb from '@seald-io/nedb';
import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { fileRights } from '../utils';
import { DataService } from './data.service';
import { testContainer } from '~test/di';
import { ensurePaths, rootPath } from '~test/path';

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

    const db = await svc.load('test');
    expect(await fstat(db.filename)).toBe(expectedMode);

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
});
