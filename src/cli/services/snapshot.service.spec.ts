import fs, {
  mkdir,
  readFile,
  readdir,
  readlink,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deleteAsync } from 'del';
import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger, pathExists } from '../utils/index.ts';
import { DataService } from './data.service.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';
import { SnapshotService } from './snapshot.service.ts';
import { testContainer } from '~test/di.ts';
import { rootPath } from '~test/path.ts';

/** Writes a file below the test root, creating its folders. */
async function write(path: string, content = ''): Promise<void> {
  await mkdir(dirname(rootPath(path)), { recursive: true });
  await writeFile(rootPath(path), content);
}

describe('cli/services/snapshot.service', () => {
  let child!: Container;
  let svc!: SnapshotService;

  beforeEach(async () => {
    await rm(rootPath('opt/containerbase'), { recursive: true, force: true });
    await rm(rootPath('var/lib/containerbase/opt'), {
      recursive: true,
      force: true,
    });
    child = await testContainer();
    svc = await child.getAsync(SnapshotService);
  });

  describe('moveAndLink', () => {
    let path!: string;
    let target!: string;

    beforeAll(() => {
      path = rootPath('opt/containerbase/tools/bun/1.0.0');
      target = rootPath('var/lib/containerbase/opt/tools/bun/1.0.0');
    });

    test('moves the folder and links it back', async () => {
      await write('opt/containerbase/tools/bun/1.0.0/bin/bun', 'bun');

      await svc.moveAndLink(path);

      expect(await readlink(path)).toBe(target);
      expect(await readFile(`${target}/bin/bun`, 'utf8')).toBe('bun');
      expect(await readFile(`${path}/bin/bun`, 'utf8')).toBe('bun');
    });

    test('replaces an older copy', async () => {
      await write('var/lib/containerbase/opt/tools/bun/1.0.0/old');
      await write('opt/containerbase/tools/bun/1.0.0/new');

      await svc.moveAndLink(path);

      expect(await pathExists(`${target}/old`)).toBe(false);
      expect(await pathExists(`${target}/new`, 'file')).toBe(true);
    });

    test('skips a missing folder and a link', async () => {
      await svc.moveAndLink(path);
      expect(await pathExists(target)).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        { path },
        'snapshot: no folder to move',
      );

      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      await svc.moveAndLink(path);
      await svc.moveAndLink(path);

      expect(await readlink(path)).toBe(target);
      expect(logger.debug).toHaveBeenCalledWith(
        { path },
        'snapshot: folder already linked',
      );
    });

    test('fails when the folder cannot be read', async () => {
      vi.spyOn(fs, 'lstat').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await expect(svc.moveAndLink(path)).rejects.toThrow('EACCES');
    });

    test('moves across devices with mv', async () => {
      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EXDEV'), { code: 'EXDEV' }),
      );

      await svc.moveAndLink(path);

      expect(await readlink(path)).toBe(target);
      expect(await pathExists(`${target}/bin/bun`, 'file')).toBe(true);
    });

    test('rethrows other errors', async () => {
      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EBUSY'), { code: 'EBUSY' }),
      );

      await expect(svc.moveAndLink(path)).rejects.toThrow('EBUSY');
      expect(await pathExists(`${path}/bin/bun`, 'file')).toBe(true);
    });

    test('moves the folder back when it cannot be linked', async () => {
      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      vi.spyOn(fs, 'symlink').mockRejectedValueOnce(new Error('EPERM'));

      await expect(svc.moveAndLink(path)).rejects.toThrow('EPERM');

      expect((await fs.lstat(path)).isDirectory()).toBe(true);
      expect(await pathExists(`${path}/bin/bun`, 'file')).toBe(true);
      expect(await pathExists(target)).toBe(false);
    });

    test('logs when the folder cannot be moved back', async () => {
      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      const rename = fs.rename.bind(fs);
      vi.spyOn(fs, 'rename')
        .mockImplementationOnce(rename)
        .mockRejectedValueOnce(new Error('EBUSY'));
      vi.spyOn(fs, 'symlink').mockRejectedValueOnce(new Error('EPERM'));

      await expect(svc.moveAndLink(path)).rejects.toThrow('EPERM');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ path, target }),
        'snapshot: could not move the folder back',
      );
    });

    test('keeps the linked folder usable', async () => {
      const pathSvc = await child.getAsync(PathService);
      await write('opt/containerbase/tools/npm/1.0.0/20.0.0/bin/npm');
      await svc.moveAndLink(rootPath('opt/containerbase/tools/npm/1.0.0'));

      // eg. an install for another parent version below the linked version
      expect(
        await pathSvc.createVersionedToolPath('npm', '1.0.0', '22.0.0'),
      ).toBe(rootPath('opt/containerbase/tools/npm/1.0.0/22.0.0'));
      expect(
        await pathExists(
          rootPath('var/lib/containerbase/opt/tools/npm/1.0.0/22.0.0'),
          'dir',
        ),
      ).toBe(true);
      expect(await pathSvc.findVersionedToolPath('npm', '1.0.0')).toBe(
        rootPath('opt/containerbase/tools/npm/1.0.0'),
      );
    });

    test('removing the link keeps the snapshot', async () => {
      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      await svc.moveAndLink(path);

      // like the cleanup of a failed install
      await deleteAsync('1.0.0', {
        cwd: rootPath('opt/containerbase/tools/bun'),
      });

      expect(await fs.lstat(path).catch(() => null)).toBeNull();
      expect(await pathExists(`${target}/bin/bun`, 'file')).toBe(true);

      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      await svc.moveAndLink(path);

      // like an uninstall
      await rm(path, { recursive: true, force: true });

      expect(await fs.lstat(path).catch(() => null)).toBeNull();
      expect(await pathExists(`${target}/bin/bun`, 'file')).toBe(true);
    });
  });

  describe('snapshotFiles: copies', () => {
    let path!: string;
    let target!: string;

    beforeAll(() => {
      path = rootPath('opt/containerbase/bin');
      target = rootPath('var/lib/containerbase/opt/bin');
    });

    test('copies links as links and removes stale copies', async () => {
      await write('var/lib/containerbase/opt/bin/old');
      await write('var/lib/containerbase/opt/bin/dir');
      await write('var/lib/containerbase/opt/bin/file/sub');
      await write('opt/containerbase/bin/bun', 'wrapper');
      await write('opt/containerbase/bin/dir/sub');
      await write('opt/containerbase/bin/file');
      await fs.symlink('bun', `${path}/bunx`);

      await svc.snapshotFiles();

      expect(await readFile(`${target}/bun`, 'utf8')).toBe('wrapper');
      expect(await readlink(`${target}/bunx`)).toBe('bun');
      expect(await pathExists(`${target}/old`)).toBe(false);
      expect(await pathExists(`${target}/dir/sub`, 'file')).toBe(true);
      expect(await pathExists(`${target}/file`, 'file')).toBe(true);
    });

    test('keeps unchanged copies and replaces changed ones', async () => {
      await write('opt/containerbase/bin/same', 'same');
      await write('opt/containerbase/bin/changed', 'old');
      await fs.symlink('same', `${path}/link`);
      await fs.symlink('same', `${path}/moved`);
      await svc.snapshotFiles();
      const same = await fs.stat(`${target}/same`);
      const link = await fs.lstat(`${target}/link`);

      await writeFile(`${path}/changed`, 'changed');
      await rm(`${path}/moved`);
      await fs.symlink('changed', `${path}/moved`);
      await svc.snapshotFiles();

      expect((await fs.stat(`${target}/same`)).ino).toBe(same.ino);
      expect((await fs.lstat(`${target}/link`)).ino).toBe(link.ino);
      expect(await readFile(`${target}/changed`, 'utf8')).toBe('changed');
      expect(await readlink(`${target}/moved`)).toBe('changed');
    });

    test('keeps the mode of the source', async () => {
      await write('opt/containerbase/bin/tool');
      await fs.chmod(`${path}/tool`, 0o775);
      await svc.snapshotFiles();
      expect((await fs.stat(`${target}/tool`)).mode & 0o777).toBe(0o775);

      await fs.chmod(`${path}/tool`, 0o755);
      await svc.snapshotFiles();
      expect((await fs.stat(`${target}/tool`)).mode & 0o777).toBe(0o755);
    });

    test('gives the copies the owner of the source as root', async () => {
      vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);
      const lchown = vi.spyOn(fs, 'lchown').mockResolvedValue();
      await write('opt/containerbase/bin/tool');
      await svc.snapshotFiles();
      const source = await fs.lstat(`${path}/tool`);
      const lstat = fs.lstat.bind(fs);
      vi.spyOn(fs, 'lstat').mockImplementation(async (file) => {
        const stats = await lstat(file);
        // a copy owned by someone else, eg. created by root
        return file === `${target}/tool`
          ? Object.assign(stats, { uid: stats.uid + 1 })
          : stats;
      });

      await svc.snapshotFiles();

      expect(lchown).toHaveBeenCalledExactlyOnceWith(
        `${target}/tool`,
        source.uid,
        source.gid,
      );
    });

    test('rethrows copy errors', async () => {
      await write('opt/containerbase/bin/tool');
      vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await expect(svc.snapshotFiles()).rejects.toThrow('EACCES');
    });

    test('fails on an unreadable folder instead of removing its copies', async () => {
      await write('opt/containerbase/bin/tool');
      await svc.snapshotFiles();
      vi.spyOn(fs, 'readdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await expect(svc.snapshotFiles()).rejects.toThrow('EACCES');

      expect(await pathExists(`${target}/tool`, 'file')).toBe(true);
    });

    test('removes the copy of a missing path', async () => {
      await write('var/lib/containerbase/opt/bin/old');

      await svc.snapshotFiles();

      expect(await pathExists(target)).toBe(false);
    });
  });

  test('remove', async () => {
    await write('var/lib/containerbase/opt/tools/npm/1.0.0/20.0.0/bin/npm');

    await svc.remove(rootPath('opt/containerbase/tools/npm/1.0.0'));

    expect(
      await pathExists(rootPath('var/lib/containerbase/opt/tools/npm/1.0.0')),
    ).toBe(false);
    expect(
      await pathExists(rootPath('var/lib/containerbase/opt/tools/npm'), 'dir'),
    ).toBe(true);
  });

  describe('snapshotFiles', () => {
    let snapshot!: string;

    beforeAll(() => {
      snapshot = rootPath('var/lib/containerbase/opt');
    });

    test('copies the files and the database', async () => {
      await write('opt/containerbase/bin/node', 'wrapper');
      await write('opt/containerbase/lib/docker/cli-plugins/docker-buildx');
      await write('opt/containerbase/ssl/cacerts', 'certs');
      await write('opt/containerbase/versions/node', '20.0.0');
      await write('opt/containerbase/tools/node/env.sh', 'export A=1');
      await write('opt/containerbase/tools/node/20.0.0/bin/node');
      await write('opt/containerbase/tools/bun/1.0.0/bin/bun');
      await write('opt/containerbase/tools/file');
      await write('var/lib/containerbase/opt/data/containerbase.db-journal');
      const dataSvc = await child.getAsync(DataService);
      const db = await dataSvc.db();
      db.prepare(
        "INSERT INTO main.versions (name, version) VALUES ('node', '20.0.0')",
      ).run();

      await svc.snapshotFiles();

      expect(await readFile(`${snapshot}/bin/node`, 'utf8')).toBe('wrapper');
      expect(
        await pathExists(`${snapshot}/lib/docker/cli-plugins/docker-buildx`),
      ).toBe(true);
      expect(await readFile(`${snapshot}/ssl/cacerts`, 'utf8')).toBe('certs');
      expect(await readFile(`${snapshot}/versions/node`, 'utf8')).toBe(
        '20.0.0',
      );
      expect(await readFile(`${snapshot}/tools/node/env.sh`, 'utf8')).toBe(
        'export A=1',
      );
      expect(await pathExists(`${snapshot}/env.d`)).toBe(false);
      expect(await pathExists(`${snapshot}/tools/node/20.0.0`)).toBe(false);
      expect(await pathExists(`${snapshot}/tools/bun`)).toBe(false);
      expect(await pathExists(`${snapshot}/tools/file`)).toBe(false);

      const file = `${snapshot}/data/containerbase.db`;
      expect(await pathExists(`${file}-journal`)).toBe(false);
      const copy = new DatabaseSync(file, { readOnly: true });
      try {
        expect(copy.prepare('PRAGMA journal_mode').get()).toEqual({
          journal_mode: 'delete',
        });
        expect(
          copy.prepare('SELECT name, version FROM versions').all(),
        ).toEqual([{ name: 'node', version: '20.0.0' }]);
      } finally {
        copy.close();
      }

      // an unchanged database is kept
      const { ino } = await fs.stat(file);
      await svc.snapshotFiles();
      expect((await fs.stat(file)).ino).toBe(ino);
      expect(logger.debug).toHaveBeenCalledWith(
        { file: rootPath('opt/containerbase/data/containerbase.db') },
        'snapshot: database unchanged',
      );

      // a changed database is copied again
      db.prepare(
        "INSERT INTO main.versions (name, version) VALUES ('node', '22.0.0')",
      ).run();
      await fs.utimes(
        rootPath('opt/containerbase/data/containerbase.db'),
        new Date(1000),
        new Date(1000),
      );
      await svc.snapshotFiles();
      const changed = new DatabaseSync(file, { readOnly: true });
      try {
        expect(
          changed.prepare('SELECT COUNT(*) AS n FROM versions').get(),
        ).toEqual({ n: 2 });
      } finally {
        changed.close();
      }
    });

    test('removes the env.sh copy of a removed tool', async () => {
      await write('opt/containerbase/tools/node/env.sh');
      await svc.snapshotFiles();

      await rm(rootPath('opt/containerbase/tools/node'), { recursive: true });
      await svc.snapshotFiles();

      expect(await pathExists(`${snapshot}/tools/node/env.sh`)).toBe(false);
    });

    test('keeps the env.sh of a linked tool folder', async () => {
      await write('opt/containerbase/tools/dotnet/env.sh', 'export A=1');
      await svc.moveAndLink(rootPath('opt/containerbase/tools/dotnet'));

      await svc.snapshotFiles();

      expect(await readFile(`${snapshot}/tools/dotnet/env.sh`, 'utf8')).toBe(
        'export A=1',
      );
    });

    test('skips missing tools and database', async () => {
      await svc.snapshotFiles();

      expect((await readdir(snapshot)).sort()).toEqual(['.links', '.stamp']);
      expect(logger.debug).toHaveBeenCalledWith(
        { file: rootPath('opt/containerbase/data/containerbase.db') },
        'snapshot: no database',
      );
    });
  });

  describe('index', () => {
    let snapshot!: string;
    let install!: string;

    beforeAll(() => {
      snapshot = rootPath('var/lib/containerbase/opt');
      install = rootPath('opt/containerbase');
    });

    test('lists the linked folders and writes matching stamps', async () => {
      await write('opt/containerbase/tools/dotnet/sdk/8.0.100/.version');
      await write('opt/containerbase/tools/node/24.0.0/bin/node');
      await write('opt/containerbase/tools/yarn/1.0.0/24.0.0/bin/yarn');
      await write('opt/containerbase/tools/yarn/2.0.0/22.0.0/bin/yarn');
      await write('opt/containerbase/bin/node', 'wrapper');
      // a tool writing into its install folder is flagged for a copy
      await svc.moveAndLink(rootPath('opt/containerbase/tools/dotnet'), true);
      await svc.moveAndLink(rootPath('opt/containerbase/tools/node/24.0.0'));
      await svc.moveAndLink(
        rootPath('opt/containerbase/tools/yarn/1.0.0/24.0.0'),
      );
      // a link elsewhere is no snapshot link
      await fs.symlink('/usr', rootPath('opt/containerbase/tools/usr'));

      await svc.snapshotFiles();

      expect(await readFile(`${snapshot}/.links`, 'utf8')).toBe(
        'c tools/dotnet\nl tools/node/24.0.0\nl tools/yarn/1.0.0/24.0.0\n',
      );
      const stamp = await svc.readStamp(snapshot);
      expect(stamp).toMatch(/^[0-9a-f]{64}$/);
      expect(await svc.readStamp(install)).toBe(stamp);

      // an unchanged snapshot keeps its stamp
      const { mtimeMs } = await fs.stat(`${snapshot}/.stamp`);
      await svc.snapshotFiles();
      expect(await svc.readStamp(snapshot)).toBe(stamp);
      expect((await fs.stat(`${snapshot}/.stamp`)).mtimeMs).toBe(mtimeMs);

      // a changed file changes it
      await writeFile(rootPath('opt/containerbase/bin/node'), 'changed');
      await svc.snapshotFiles();
      expect(await svc.readStamp(snapshot)).not.toBe(stamp);
      expect(await svc.readStamp(install)).toBe(await svc.readStamp(snapshot));
    });

    test('readStamp is null without a stamp', async () => {
      expect(await svc.readStamp(install)).toBeNull();
    });

    test('copy copies a folder with links', async () => {
      await write('var/lib/containerbase/opt/tools/php/8.0.0/bin/php', 'php');
      await fs.symlink(
        'php',
        rootPath('var/lib/containerbase/opt/tools/php/8.0.0/bin/php8'),
      );

      await svc.copy(
        rootPath('var/lib/containerbase/opt/tools/php/8.0.0'),
        rootPath('opt/containerbase/tools/php/8.0.0'),
      );

      expect(
        await readFile(
          rootPath('opt/containerbase/tools/php/8.0.0/bin/php'),
          'utf8',
        ),
      ).toBe('php');
      expect(
        await readlink(rootPath('opt/containerbase/tools/php/8.0.0/bin/php8')),
      ).toBe('php');
    });
  });
});
