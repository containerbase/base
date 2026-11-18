import fs, { mkdir, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { codeBlock } from 'common-tags';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import {
  type NedbStore,
  hasNedb,
  insertStores,
  linkPackageFolders,
  nedbStores,
  prefixPackages,
  readNedb,
  readNedbStores,
} from './nedb.ts';
import { PathService } from './path.service.ts';
import { testContainer } from '~test/di.ts';
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

  describe('prefixPackages', () => {
    /** A store of the former nedb databases with the rows. */
    function store(
      name: keyof typeof nedbStores,
      rows: NedbStore['rows'],
    ): NedbStore {
      return { name, file, sql: nedbStores[name].sql, rows, skipped: 0 };
    }

    test('renames the packages, not the tools installed by name', () => {
      const stores = [
        store('links', [
          ['del', 'del-cli', '5.0.0'],
          ['pnpm', 'pnpm', '9.0.0'],
        ]),
        store('state', [
          ['del-cli', 'del-cli', '5.0.0', 'node', '22.0.0'],
          ['node', 'node', '22.0.0', null, null],
        ]),
        store('types', [
          ['del-cli', 'npm'],
          ['rake', 'gem'],
          ['pnpm', 'npm'],
          // tools with an own install service older versions used
          ['yarn', 'npm'],
          ['cocoapods', 'gem'],
          ['other', 'other'],
          [1, 'npm'],
        ]),
        store('versions', [
          ['rake', '13.0.6', 'ruby', '3.4.0'],
          ['node', '22.0.0', null, null],
        ]),
      ];

      expect(prefixPackages(stores)).toEqual(
        new Map([
          ['del-cli', 'npm+del-cli'],
          ['rake', 'gem+rake'],
        ]),
      );
      expect(stores.map((s) => s.rows)).toEqual([
        [
          ['del', 'npm+del-cli', '5.0.0'],
          ['pnpm', 'pnpm', '9.0.0'],
        ],
        [
          ['npm+del-cli', 'npm+del-cli', '5.0.0', 'node', '22.0.0'],
          ['node', 'node', '22.0.0', null, null],
        ],
        [
          ['npm+del-cli', 'npm'],
          ['gem+rake', 'gem'],
          ['pnpm', 'npm'],
          ['yarn', 'npm'],
          ['cocoapods', 'gem'],
          ['other', 'other'],
          [1, 'npm'],
        ],
        [
          ['gem+rake', '13.0.6', 'ruby', '3.4.0'],
          ['node', '22.0.0', null, null],
        ],
      ]);
    });

    test('renames nothing without a types store', () => {
      expect(prefixPackages([store('links', [['a', 'b', '1']])])).toEqual(
        new Map(),
      );
    });

    test('keeps a store without tool columns', () => {
      const other: NedbStore = {
        name: 'other',
        file,
        sql: '',
        rows: [['del-cli']],
        skipped: 0,
      };

      prefixPackages([store('types', [['del-cli', 'npm']]), other]);

      expect(other.rows).toEqual([['del-cli']]);
    });
  });

  describe('linkPackageFolders', () => {
    test('links the new tool folders to the old ones', async () => {
      const pathSvc = await (await testContainer()).getAsync(PathService);
      const { toolsPath, versionPath } = pathSvc;
      await rm(toolsPath, { recursive: true, force: true });
      await mkdir(`${toolsPath}/@scope__pkg/1.0.0`, { recursive: true });
      await rm(versionPath, { recursive: true, force: true });
      await mkdir(versionPath, { recursive: true });
      await writeFile(`${versionPath}/@scope__pkg`, '1.0.0');

      await linkPackageFolders(
        pathSvc,
        new Map([
          ['@scope/pkg', 'npm+@scope/pkg'],
          // without a folder
          ['gone', 'npm+gone'],
        ]),
      );

      // the real folder stays, the new name links to it
      expect((await fs.readdir(toolsPath)).sort()).toEqual([
        '@scope__pkg',
        'npm+@scope__pkg',
      ]);
      expect(await fs.readlink(`${toolsPath}/npm+@scope__pkg`)).toBe(
        '@scope__pkg',
      );
      expect(await fs.readdir(`${toolsPath}/npm+@scope__pkg`)).toEqual([
        '1.0.0',
      ]);
      // the file of the current version gets the new name
      expect(await fs.readdir(versionPath)).toEqual(['npm+@scope__pkg']);
    });

    test('keeps the link of an interrupted earlier migration', async () => {
      const pathSvc = await (await testContainer()).getAsync(PathService);
      const { toolsPath } = pathSvc;
      await rm(toolsPath, { recursive: true, force: true });
      await mkdir(`${toolsPath}/pkg/1.0.0`, { recursive: true });
      await fs.symlink('pkg', `${toolsPath}/npm+pkg`);

      await expect(
        linkPackageFolders(pathSvc, new Map([['pkg', 'npm+pkg']])),
      ).resolves.toBeUndefined();

      expect(await fs.readlink(`${toolsPath}/npm+pkg`)).toBe('pkg');
    });

    test.each([
      { name: 'a link to another folder', other: 'link' },
      { name: 'a folder', other: 'folder' },
    ])('throws when $name has the name of the link', async ({ other }) => {
      const pathSvc = await (await testContainer()).getAsync(PathService);
      const { toolsPath } = pathSvc;
      await rm(toolsPath, { recursive: true, force: true });
      await mkdir(`${toolsPath}/pkg/1.0.0`, { recursive: true });
      if (other === 'link') {
        await fs.symlink('other', `${toolsPath}/npm+pkg`);
      } else {
        await mkdir(`${toolsPath}/npm+pkg`);
      }

      await expect(
        linkPackageFolders(pathSvc, new Map([['pkg', 'npm+pkg']])),
      ).rejects.toThrow('EEXIST');
    });

    test('throws when a version file can not be renamed', async () => {
      const pathSvc = await (await testContainer()).getAsync(PathService);
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EACCES: failed'), { code: 'EACCES' }),
      );

      await expect(
        linkPackageFolders(pathSvc, new Map([['a', 'npm+a']])),
      ).rejects.toThrow('EACCES: failed');
    });

    test('throws when a link can not be created', async () => {
      const pathSvc = await (await testContainer()).getAsync(PathService);
      await mkdir(`${pathSvc.toolsPath}/a`, { recursive: true });
      vi.spyOn(fs, 'symlink').mockRejectedValueOnce(
        Object.assign(new Error('EACCES: failed'), { code: 'EACCES' }),
      );

      await expect(
        linkPackageFolders(pathSvc, new Map([['a', 'npm+a']])),
      ).rejects.toThrow('EACCES: failed');
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
