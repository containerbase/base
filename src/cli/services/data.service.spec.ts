import fs, {
  chmod,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { platform } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { codeBlock } from 'common-tags';
import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { fileRights, logger } from '../utils/index.ts';
import { DataService } from './data.service.ts';
import { PathService } from './path.service.ts';
import { testContainer } from '~test/di.ts';
import { rootPath } from '~test/path.ts';

/** The permission bits of the path. */
async function fstat(path: string): Promise<number> {
  const s = await stat(path);
  return s.mode & fileRights;
}

/** All rows of a table, in insertion order. */
function rows(db: DatabaseSync, table: string): unknown[] {
  return db
    .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
    .all()
    .map((row) => ({ ...row }));
}

/** Rejects the data folder write check with the given error code. */
function mockAccess(code: string): void {
  vi.spyOn(fs, 'access').mockRejectedValueOnce(
    Object.assign(new Error(`${code}: access failed`), { code }),
  );
}

describe('cli/services/data.service', () => {
  const expectedMode = platform() === 'win32' ? 0 : 0o664;

  let child!: Container;
  let svc!: DataService;
  let dataDir!: string;
  let dbFile!: string;

  beforeAll(() => {
    dataDir = rootPath('opt/containerbase/data');
    dbFile = rootPath('opt/containerbase/data/containerbase.db');
  });

  beforeEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    await mkdir(dataDir, { recursive: true });
    await chmod(dataDir, 0o775);
    child = await testContainer();
    svc = await child.getAsync(DataService);
  });

  /** Writes the files of the databases of older containerbase versions. */
  async function writeNedb(): Promise<void> {
    await writeFile(
      `${dataDir}/versions.nedb`,
      codeBlock`
        {"name":"node","version":"20.0.0","_id":"v1","createdAt":{"$$date":1},"updatedAt":{"$$date":1}}
        {"name":"pnpm","version":"9.0.0","parent":{"name":"node","version":"20.0.0"},"_id":"v2"}
        {"name":"node","version":"18.0.0","_id":"v3"}
        {"$$deleted":true,"_id":"v3"}
        {"$$indexCreated":{"fieldName":"name","unique":false,"sparse":false}}
        {"$$indexRemoved":"name"}
        not json

        {"name":"yarn","version":"1.0.0"}
        {"name":"yarn","_id":"v4"}
      `,
    );
    await writeFile(
      `${dataDir}/links.nedb`,
      codeBlock`
        {"name":"node","tool":{"name":"node","version":"18.0.0"},"_id":"l1"}
        {"name":"npx","tool":{"name":"node","version":"20.0.0"},"_id":"l2"}
        {"name":"node","tool":{"name":"node","version":"20.0.0"},"_id":"l1"}
      `,
    );
    await writeFile(
      `${dataDir}/state.nedb`,
      codeBlock`
        {"name":"node","tool":{"name":"node","version":"20.0.0"},"_id":"s1"}
        {"name":"pnpm","tool":{"name":"pnpm","version":"9.0.0"},"parent":{"name":"node","version":"20.0.0"},"_id":"s2"}
      `,
    );
    await writeFile(
      `${dataDir}/types.nedb`,
      `${JSON.stringify({ name: 'pnpm', type: 'npm', _id: 't1' })}\n`,
    );
  }

  test('creates the database', async () => {
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');

    const db = await svc.db();

    expect(db.location()).toBe(dbFile);
    expect(await svc.db()).toBe(db);
    expect(await fstat(dbFile)).toBe(expectedMode);
    expect(await fstat(dataDir)).toBe(0o775);
    expect(setOwner).toHaveBeenCalledExactlyOnceWith({
      path: dbFile,
      mode: 0o664,
    });
    expect(db.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 1,
    });
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({
      journal_mode: 'delete',
    });
    expect(
      db
        .prepare(
          `SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name`,
        )
        .all()
        .map((row) => ({ ...row })),
    ).toEqual([
      { type: 'table', name: 'links' },
      { type: 'index', name: 'links_tool' },
      { type: 'table', name: 'state' },
      { type: 'table', name: 'types' },
      { type: 'table', name: 'versions' },
      { type: 'index', name: 'versions_name' },
      { type: 'index', name: 'versions_parent' },
    ]);
    // no migration without nedb files
    expect(logger.info).not.toHaveBeenCalled();

    // an existing database is opened as is
    db.prepare(`INSERT INTO types (name, type) VALUES ('pnpm', 'npm')`).run();
    const other = await (await testContainer()).getAsync(DataService);
    expect(rows(await other.db(), 'types')).toEqual([
      { name: 'pnpm', type: 'npm' },
    ]);
  });

  test('creates the data folder when the check fails otherwise', async () => {
    await rm(dataDir, { recursive: true });
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');
    mockAccess('ENOENT');

    const db = await svc.db();

    expect(db.location()).toBe(dbFile);
    expect(setOwner.mock.calls).toEqual([
      [{ path: dataDir, mode: 0o775 }],
      [{ path: dbFile, mode: 0o664 }],
    ]);
  });

  test('opens read-only when the data folder is not writable', async () => {
    const rw = await svc.db();
    rw.prepare(`INSERT INTO types (name, type) VALUES ('pnpm', 'npm')`).run();

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

    const db = await roSvc.db();
    expect(await roSvc.db()).toBe(db);
    expect(access).toHaveBeenCalledExactlyOnceWith(dataDir, fs.constants.W_OK);
    expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
    expect(roSetOwner).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      { file: dbFile },
      'opening database read-only',
    );
    expect(() =>
      db.prepare(`INSERT INTO types (name, type) VALUES ('yarn', 'npm')`).run(),
    ).toThrow('attempt to write a readonly database');
  });

  test('read-only loads the databases of an older version into memory', async () => {
    await writeNedb();
    mockAccess('EACCES');

    const db = await svc.db();

    expect(db.location()).toBeNull();
    expect(rows(db, 'versions')).toEqual([
      {
        name: 'node',
        version: '20.0.0',
        parent_name: '',
        parent_version: '',
      },
      {
        name: 'pnpm',
        version: '9.0.0',
        parent_name: 'node',
        parent_version: '20.0.0',
      },
    ]);
    expect(rows(db, 'links')).toHaveLength(2);
    expect(rows(db, 'state')).toHaveLength(2);
    expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
    // nothing is migrated or written
    expect((await readdir(dataDir)).sort()).toEqual([
      'links.nedb',
      'state.nedb',
      'types.nedb',
      'versions.nedb',
    ]);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'loading the databases of an older version into memory',
    );
  });

  test('read-only treats a database without schema as missing', async () => {
    // another process created the file but not yet the schema
    await writeNedb();
    new DatabaseSync(dbFile).close();
    mockAccess('EROFS');

    const db = await svc.db();

    expect(db.location()).toBeNull();
    expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
    expect(logger.debug).toHaveBeenCalledWith(
      { file: dbFile },
      'database has no schema yet',
    );
  });

  test('read-only without a database finds nothing', async () => {
    mockAccess('EROFS');

    const db = await svc.db();

    expect(db.location()).toBeNull();
    expect(rows(db, 'versions')).toEqual([]);
    expect(rows(db, 'links')).toEqual([]);
    expect(rows(db, 'state')).toEqual([]);
    expect(rows(db, 'types')).toEqual([]);
    expect(await readdir(dataDir)).toEqual([]);
  });

  test('read-only fails when the database can not be checked', async () => {
    mockAccess('EROFS');
    vi.spyOn(fs, 'stat').mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    // an unreadable database must not look like an empty one
    await expect(svc.db()).rejects.toThrow('EACCES: permission denied');
  });

  test('read-only closes the database when it can not be read', async () => {
    await writeFile(dbFile, 'not a database, but long enough to be read');
    mockAccess('EROFS');
    const close = vi.spyOn(DatabaseSync.prototype, 'close');

    await expect(svc.db()).rejects.toThrow('file is not a database');
    expect(close).toHaveBeenCalledOnce();
  });

  describe('readOnly', () => {
    test('opens an existing database read-only', async () => {
      const rw = await svc.db();
      rw.prepare(`INSERT INTO types (name, type) VALUES ('pnpm', 'npm')`).run();

      const roChild = await testContainer();
      const roSvc = await roChild.getAsync(DataService);
      const setOwner = vi.spyOn(
        await roChild.getAsync(PathService),
        'setOwner',
      );
      roSvc.readOnly();

      const db = await roSvc.db();
      expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
      // waits for a writer like the writable connection
      expect(db.prepare('PRAGMA busy_timeout').get()).toEqual({
        timeout: 5000,
      });
      expect(setOwner).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        { file: dbFile },
        'opening database read-only',
      );
      expect(() => db.prepare(`DELETE FROM types`).run()).toThrow(
        'attempt to write a readonly database',
      );

      // has no effect on an opened database
      svc.readOnly();
      expect(await svc.db()).toBe(rw);
    });

    test('migrates the databases of an older version first', async () => {
      await writeNedb();
      svc.readOnly();

      const db = await svc.db();

      expect(db.location()).toBe(dbFile);
      expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
      // `versions.nedb` has skipped documents
      expect((await readdir(dataDir)).sort()).toEqual([
        'containerbase.db',
        'versions.nedb',
      ]);
      expect(() => db.prepare(`DELETE FROM types`).run()).toThrow(
        'attempt to write a readonly database',
      );
    });

    test('opens the database writable briefly when a journal exists', async () => {
      const rw = await svc.db();
      rw.prepare(`INSERT INTO types (name, type) VALUES ('pnpm', 'npm')`).run();
      rw.close();
      await writeFile(`${dbFile}-journal`, '');

      const roChild = await testContainer();
      const roSvc = await roChild.getAsync(DataService);
      const setOwner = vi.spyOn(
        await roChild.getAsync(PathService),
        'setOwner',
      );
      const close = vi.spyOn(DatabaseSync.prototype, 'close');
      roSvc.readOnly();

      const db = await roSvc.db();

      // a writable connection is opened and closed before the read-only one,
      // sqlite rolls back a hot journal then, nothing else is changed
      expect(close).toHaveBeenCalledOnce();
      expect(close.mock.contexts[0]).toHaveProperty('isOpen', false);
      expect(db.isOpen).toBe(true);
      expect(setOwner).not.toHaveBeenCalled();
      expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
      expect(() => db.prepare(`DELETE FROM types`).run()).toThrow(
        'attempt to write a readonly database',
      );
    });

    test('opens read-only when the brief writable open fails', async () => {
      const rw = await svc.db();
      rw.prepare(`INSERT INTO types (name, type) VALUES ('pnpm', 'npm')`).run();
      rw.close();
      await writeFile(`${dbFile}-journal`, '');

      const roSvc = await (await testContainer()).getAsync(DataService);
      const err = new Error('database is locked');
      vi.spyOn(DatabaseSync.prototype, 'prepare').mockImplementationOnce(() => {
        throw err;
      });
      roSvc.readOnly();

      const db = await roSvc.db();

      expect(logger.debug).toHaveBeenCalledWith(
        { file: dbFile, err },
        'could not roll back the database journal',
      );
      expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
      expect(() => db.prepare(`DELETE FROM types`).run()).toThrow(
        'attempt to write a readonly database',
      );
    });

    test('finds nothing without a database', async () => {
      svc.readOnly();

      const db = await svc.db();

      expect(db.location()).toBeNull();
      expect(rows(db, 'versions')).toEqual([]);
      expect(await readdir(dataDir)).toEqual([]);
    });
  });

  test('migrates the databases of an older version', async () => {
    await writeNedb();

    const db = await svc.db();

    expect(rows(db, 'versions')).toEqual([
      {
        name: 'node',
        version: '20.0.0',
        parent_name: '',
        parent_version: '',
      },
      {
        name: 'pnpm',
        version: '9.0.0',
        parent_name: 'node',
        parent_version: '20.0.0',
      },
    ]);
    expect(rows(db, 'links')).toEqual([
      { name: 'node', tool_name: 'node', tool_version: '20.0.0' },
      { name: 'npx', tool_name: 'node', tool_version: '20.0.0' },
    ]);
    expect(rows(db, 'state')).toEqual([
      {
        name: 'node',
        tool_name: 'node',
        tool_version: '20.0.0',
        parent_name: '',
        parent_version: '',
      },
      {
        name: 'pnpm',
        tool_name: 'pnpm',
        tool_version: '9.0.0',
        parent_name: 'node',
        parent_version: '20.0.0',
      },
    ]);
    expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);

    // the file with skipped documents is kept
    expect((await readdir(dataDir)).sort()).toEqual([
      'containerbase.db',
      'versions.nedb',
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      { store: 'versions', file: `${dataDir}/versions.nedb`, skipped: 3 },
      'kept nedb database with skipped documents',
    );
    for (const [store, count] of [
      ['links', 2],
      ['state', 2],
      ['types', 1],
      ['versions', 2],
    ]) {
      expect(logger.info).toHaveBeenCalledWith(
        { store, count },
        'migrated nedb database',
      );
    }
  });

  test('fails the migration when an old database can not be read', async () => {
    await writeNedb();
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(
      Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }),
    );

    // the documents must not be lost by marking the database as migrated
    await expect(svc.db()).rejects.toThrow('EACCES: permission denied');

    expect((await readdir(dataDir)).sort()).toEqual([
      'containerbase.db',
      'links.nedb',
      'state.nedb',
      'types.nedb',
      'versions.nedb',
    ]);
    const db = new DatabaseSync(dbFile, { readOnly: true });
    expect(db.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 0,
    });
    db.close();
  });

  test('skips the migration when another process migrated first', async () => {
    await writeNedb();
    // `links` is the first store read, the others are gone once it returns
    const links = await readFile(`${dataDir}/links.nedb`, 'utf8');
    vi.spyOn(fs, 'readFile').mockImplementationOnce(async () => {
      // another process migrates and removes a link while the file is read
      const other = await (await testContainer()).getAsync(DataService);
      const otherDb = await other.db();
      otherDb.prepare(`DELETE FROM links WHERE name = 'npx'`).run();
      otherDb.close();
      return links;
    });

    const db = await svc.db();

    // the stale link read before is not inserted again
    expect(rows(db, 'links')).toEqual([
      { name: 'node', tool_name: 'node', tool_version: '20.0.0' },
    ]);
    expect(rows(db, 'versions')).toHaveLength(2);
    expect(rows(db, 'state')).toHaveLength(2);
    expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
    expect((await readdir(dataDir)).sort()).toEqual([
      'containerbase.db',
      'versions.nedb',
    ]);
    // only the other process migrated
    expect(logger.info).toHaveBeenCalledTimes(4);
  });

  test('read-only uses the database migrated while the old ones are read', async () => {
    await writeNedb();
    mockAccess('EROFS');
    // `links` is the first store read, the others are gone once it returns
    const links = await readFile(`${dataDir}/links.nedb`, 'utf8');
    vi.spyOn(fs, 'readFile').mockImplementationOnce(async () => {
      // another process migrates while the file is read
      const other = await (await testContainer()).getAsync(DataService);
      (await other.db()).close();
      return links;
    });

    const db = await svc.db();

    // not the partly read old databases
    expect(db.location()).toBe(dbFile);
    expect(rows(db, 'links')).toHaveLength(2);
    expect(rows(db, 'state')).toHaveLength(2);
    expect(rows(db, 'types')).toEqual([{ name: 'pnpm', type: 'npm' }]);
    expect(logger.debug).toHaveBeenCalledWith(
      { file: dbFile },
      'database was migrated meanwhile',
    );
    expect(() => db.prepare(`DELETE FROM types`).run()).toThrow(
      'attempt to write a readonly database',
    );
  });

  test('fails on a database of a newer schema', async () => {
    const newer = new DatabaseSync(dbFile);
    newer.exec('PRAGMA user_version = 2');
    newer.close();
    const error =
      'The containerbase database was created by a newer containerbase version (schema 2), update containerbase.';
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');
    const close = vi.spyOn(DatabaseSync.prototype, 'close');

    await expect(svc.db()).rejects.toThrow(error);
    expect(setOwner).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();

    const roSvc = await (await testContainer()).getAsync(DataService);
    mockAccess('EROFS');
    await expect(roSvc.db()).rejects.toThrow(error);
  });

  test('keeps the journal mode of a database of a newer schema', async () => {
    const newer = new DatabaseSync(dbFile);
    newer.exec('PRAGMA journal_mode = WAL; PRAGMA user_version = 2');
    newer.close();
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');

    await expect(svc.db()).rejects.toThrow('schema 2');

    expect(setOwner).not.toHaveBeenCalled();
    const db = new DatabaseSync(dbFile);
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({
      journal_mode: 'wal',
    });
    db.close();
  });

  test('closes the database when the owner can not be set', async () => {
    const err = new Error('EPERM: operation not permitted');
    vi.spyOn(await child.getAsync(PathService), 'setOwner').mockRejectedValue(
      err,
    );
    const close = vi.spyOn(DatabaseSync.prototype, 'close');

    await expect(svc.db()).rejects.toBe(err);

    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.contexts[0]).toHaveProperty('isOpen', false);
  });

  test('keeps the old databases when the migration fails', async () => {
    await writeNedb();
    const broken = new DatabaseSync(dbFile);
    broken.exec('CREATE TABLE versions (x TEXT)');
    broken.close();
    const setOwner = vi.spyOn(await child.getAsync(PathService), 'setOwner');
    const close = vi.spyOn(DatabaseSync.prototype, 'close');

    await expect(svc.db()).rejects.toThrow('no such column: name');
    expect(close).toHaveBeenCalledOnce();
    expect(close.mock.contexts[0]).toHaveProperty('isOpen', false);

    // the owner is set before the migration
    expect(setOwner).toHaveBeenCalledExactlyOnceWith({
      path: dbFile,
      mode: 0o664,
    });
    expect(await fstat(dbFile)).toBe(expectedMode);

    expect((await readdir(dataDir)).sort()).toEqual([
      'containerbase.db',
      'links.nedb',
      'state.nedb',
      'types.nedb',
      'versions.nedb',
    ]);
    const db = new DatabaseSync(dbFile, { readOnly: true });
    expect(
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all(),
    ).toEqual([{ name: 'versions' }]);
    expect(db.prepare('PRAGMA user_version').get()).toEqual({
      user_version: 0,
    });
    db.close();
  });
});
