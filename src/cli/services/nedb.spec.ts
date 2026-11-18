import fs, { mkdir, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { codeBlock } from 'common-tags';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import {
  type NedbStore,
  hasNedb,
  insertStores,
  nedbStores,
  readNedb,
  readNedbStores,
} from './nedb.ts';
import { rootPath } from '~test/path.ts';

/** Rejects once with an error of the given code. */
function rejectOnce(method: 'readFile' | 'stat', code: string): void {
  vi.spyOn(fs, method).mockRejectedValueOnce(
    Object.assign(new Error(`${code}: failed`), { code }),
  );
}

describe('cli/services/nedb', () => {
  const { row } = nedbStores.types;

  let dataDir!: string;
  let file!: string;

  beforeAll(() => {
    dataDir = rootPath('opt/containerbase/nedb');
    file = `${dataDir}/types.nedb`;
  });

  beforeEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    await mkdir(dataDir, { recursive: true });
  });

  describe('readNedb', () => {
    test('returns null for a missing file', async () => {
      expect(await readNedb(file, row)).toBeNull();
    });

    test('throws when the file can not be read', async () => {
      await writeFile(file, '{"name":"pnpm","type":"npm","_id":"t1"}');
      rejectOnce('readFile', 'EACCES');

      await expect(readNedb(file, row)).rejects.toThrow('EACCES: failed');
    });

    test('returns no rows for an empty file', async () => {
      await writeFile(file, '');

      expect(await readNedb(file, row)).toEqual({ rows: [], skipped: 0 });
    });

    test('a later line with the same id replaces the document', async () => {
      await writeFile(
        file,
        codeBlock`
          {"name":"pnpm","type":"npm","_id":"t1"}
          {"name":"yarn","type":"npm","_id":"t2"}
          {"name":"pnpm","type":"pnpm","_id":"t1"}
        `,
      );

      expect(await readNedb(file, row)).toEqual({
        rows: [
          ['pnpm', 'pnpm'],
          ['yarn', 'npm'],
        ],
        skipped: 0,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('removes deleted documents', async () => {
      await writeFile(
        file,
        codeBlock`
          {"name":"pnpm","type":"npm","_id":"t1"}
          {"name":"yarn","type":"npm","_id":"t2"}
          {"$$deleted":true,"_id":"t1"}
        `,
      );

      expect(await readNedb(file, row)).toEqual({
        rows: [['yarn', 'npm']],
        skipped: 0,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('skips index lines and empty lines silently', async () => {
      await writeFile(
        file,
        codeBlock`
          {"$$indexCreated":{"fieldName":"name","unique":false,"sparse":false}}

          {"$$indexRemoved":"name"}
          {"name":"pnpm","type":"npm","_id":"t1"}
        `,
      );

      expect(await readNedb(file, row)).toEqual({
        rows: [['pnpm', 'npm']],
        skipped: 0,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('skips malformed lines', async () => {
      await writeFile(
        file,
        codeBlock`
          not json
          {"name":"yarn","type":"npm"}
          {"name":"pnpm","type":"npm","_id":"t1"}
        `,
      );

      expect(await readNedb(file, row)).toEqual({
        rows: [['pnpm', 'npm']],
        skipped: 2,
      });
      expect(logger.warn).toHaveBeenCalledWith(
        { file, line: 'not json' },
        'skipping malformed database line',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { file, line: '{"name":"yarn","type":"npm"}' },
        'skipping malformed database line',
      );
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    test('skips malformed documents', async () => {
      await writeFile(
        file,
        codeBlock`
          {"name":"yarn","_id":"t2"}
          {"name":"pnpm","type":"npm","_id":"t1"}
        `,
      );

      expect(await readNedb(file, row)).toEqual({
        rows: [['pnpm', 'npm']],
        skipped: 1,
      });
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { file, doc: { name: 'yarn', _id: 't2' } },
        'skipping malformed database document',
      );
    });
  });

  describe('readNedbStores', () => {
    test('reads nothing without files', async () => {
      expect(await readNedbStores(dataDir)).toEqual([]);
    });

    test('reads the existing files in store order', async () => {
      await writeFile(
        `${dataDir}/versions.nedb`,
        '{"name":"node","version":"20.0.0","_id":"v1"}',
      );
      await writeFile(
        file,
        codeBlock`
          {"name":"pnpm","type":"npm","_id":"t1"}
          not json
        `,
      );

      expect(await readNedbStores(dataDir)).toEqual([
        {
          name: 'types',
          file,
          sql: nedbStores.types.sql,
          rows: [['pnpm', 'npm']],
          skipped: 1,
        },
        {
          name: 'versions',
          file: `${dataDir}/versions.nedb`,
          sql: nedbStores.versions.sql,
          rows: [['node', '20.0.0', '', '']],
          skipped: 0,
        },
      ]);
    });
  });

  describe('hasNedb', () => {
    test('is false without files', async () => {
      expect(await hasNedb(dataDir)).toBe(false);
    });

    test('is true with one file', async () => {
      await writeFile(`${dataDir}/state.nedb`, '');

      expect(await hasNedb(dataDir)).toBe(true);
    });

    test('throws when a file can not be checked', async () => {
      rejectOnce('stat', 'EACCES');

      await expect(hasNedb(dataDir)).rejects.toThrow('EACCES: failed');
    });
  });

  describe('insertStores', () => {
    test('inserts the rows into their tables', () => {
      const db = new DatabaseSync(':memory:');
      db.exec('CREATE TABLE types (name TEXT PRIMARY KEY, type TEXT NOT NULL)');
      const stores: NedbStore[] = [
        {
          name: 'types',
          file,
          sql: nedbStores.types.sql,
          rows: [
            ['pnpm', 'npm'],
            ['yarn', 'npm'],
            ['pnpm', 'pnpm'],
          ],
          skipped: 0,
        },
      ];

      insertStores(db, stores);

      expect(
        db
          .prepare('SELECT * FROM types ORDER BY name')
          .all()
          .map((r) => ({ ...r })),
      ).toEqual([
        { name: 'pnpm', type: 'pnpm' },
        { name: 'yarn', type: 'npm' },
      ]);
      db.close();
    });
  });
});
