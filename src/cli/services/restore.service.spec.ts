import fs, { mkdir, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { logger, pathExists } from '../utils/index.ts';
import { DataService } from './data.service.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';
import { RestoreService } from './restore.service.ts';
import { SnapshotService } from './snapshot.service.ts';
import { VersionService } from './version.service.ts';
import { testContainer } from '~test/di.ts';
import { rootPath } from '~test/path.ts';

/** Writes a file below the test root, creating its folders. */
async function write(path: string, content = ''): Promise<void> {
  await mkdir(dirname(rootPath(path)), { recursive: true });
  await writeFile(rootPath(path), content);
}

/** Whether the path is a real folder, not a link. */
async function isRealDir(path: string): Promise<boolean> {
  return (await fs.lstat(rootPath(path))).isDirectory();
}

/** Whether the path is a link. */
async function isLink(path: string): Promise<boolean> {
  return (await fs.lstat(rootPath(path))).isSymbolicLink();
}

/** Rejects the write check of the paths with the given error code. */
function denyAccess(code: string, ...paths: string[]): void {
  const access = fs.access.bind(fs);
  vi.spyOn(fs, 'access').mockImplementation((file, mode) =>
    paths.includes(file as string)
      ? Promise.reject(Object.assign(new Error(code), { code }))
      : access(file, mode),
  );
}

/**
 * Makes `/opt/containerbase` look like a mount point, eg. a volume, by giving
 * it another device than its parent.
 */
function mountVolume(): void {
  const stat = fs.stat.bind(fs);
  const install = rootPath('opt/containerbase');
  vi.spyOn(fs, 'stat').mockImplementation(async (path) => {
    const stats = await stat(path);
    return path === install
      ? Object.assign(stats, { dev: stats.dev + 1 })
      : stats;
  });
}

describe('cli/services/restore.service', () => {
  let child!: Container;
  let svc!: RestoreService;
  let snapshotSvc!: SnapshotService;
  let snapshot!: string;
  let install!: string;

  beforeEach(async () => {
    snapshot = rootPath('var/lib/containerbase/opt');
    install = rootPath('opt/containerbase');
    await rm(install, { recursive: true, force: true });
    await rm(snapshot, { recursive: true, force: true });
    child = await testContainer();
    svc = await child.getAsync(RestoreService);
    snapshotSvc = await child.getAsync(SnapshotService);
  });

  /**
   * Installs some tools at "build time" and snapshots them, `php` as a tool
   * writing into its install folder. Then replaces `/opt/containerbase` by
   * an empty folder, like an empty volume, unless `keep` is set, like a
   * volume docker filled from the image.
   */
  async function buildAndMount(keep = false): Promise<void> {
    await write('opt/containerbase/tools/node/24.0.0/bin/node', 'node');
    await write('opt/containerbase/tools/node/env.sh', 'export A=1');
    await write('opt/containerbase/tools/php/8.0.0/bin/php', 'php');
    await write('opt/containerbase/tools/yarn/1.0.0/24.0.0/bin/yarn');
    await write('opt/containerbase/bin/node', 'wrapper');
    await write('opt/containerbase/versions/node', '24.0.0');
    await fs.symlink('node', rootPath('opt/containerbase/bin/nodejs'));
    await snapshotSvc.moveAndLink(`${install}/tools/node/24.0.0`);
    await snapshotSvc.moveAndLink(`${install}/tools/php/8.0.0`, true);
    await snapshotSvc.moveAndLink(`${install}/tools/yarn/1.0.0/24.0.0`);
    const db = await (await child.getAsync(DataService)).db();
    db.exec(`
      INSERT INTO main.versions (name, version) VALUES ('node', '24.0.0');
      INSERT INTO main.versions VALUES ('yarn', '1.0.0', 'node', '24.0.0');
      INSERT INTO main.links VALUES ('node', 'node', '24.0.0');
      INSERT INTO main.state (name, tool_name, tool_version) VALUES ('node', 'node', '24.0.0');
    `);
    await snapshotSvc.snapshotFiles();
    db.close();

    if (!keep) {
      await rm(install, { recursive: true });
      await mkdir(install);
    }
  }

  test('skips an image without a snapshot', async () => {
    await svc.restore();

    expect(await pathExists(install)).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith('restore: no snapshot');
  });

  test('skips a matching /opt/containerbase', async () => {
    await buildAndMount(true);
    const spy = vi.spyOn(PathService.prototype, 'ensureWritableDirs');

    await svc.restore();

    expect(spy).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'restore: /opt/containerbase matches the snapshot',
    );
  });

  test('restores an empty volume from a writable snapshot', async () => {
    await buildAndMount();

    await svc.restore();

    expect(await readlink(`${install}/tools/node/24.0.0`)).toBe(
      `${snapshot}/tools/node/24.0.0`,
    );
    // a tool writing into its install folder gets a copy
    expect(await isRealDir('opt/containerbase/tools/php/8.0.0')).toBe(true);
    expect(await readFile(`${install}/tools/php/8.0.0/bin/php`, 'utf8')).toBe(
      'php',
    );
    expect(await isRealDir('opt/containerbase/tools/yarn/1.0.0')).toBe(true);
    expect(await readlink(`${install}/tools/yarn/1.0.0/24.0.0`)).toBe(
      `${snapshot}/tools/yarn/1.0.0/24.0.0`,
    );
    expect(await readFile(`${install}/bin/node`, 'utf8')).toBe('wrapper');
    expect(await readlink(`${install}/bin/nodejs`)).toBe('node');
    expect(await readFile(`${install}/tools/node/env.sh`, 'utf8')).toBe(
      'export A=1',
    );
    expect(await snapshotSvc.readStamp(install)).toBe(
      await snapshotSvc.readStamp(snapshot),
    );
    expect(
      Object.keys(JSON.parse(await readFile(`${install}/.restored`, 'utf8'))),
    ).toContain('bin/node');
    // the database isn't copied, the build-time one is attached instead
    expect(await pathExists(`${install}/data/containerbase.db`)).toBe(false);
    const versions = await (await testContainer()).getAsync(VersionService);
    expect(await versions.findInstalled('node')).toEqual([
      { name: 'node', version: '24.0.0' },
    ]);

    // a second run is a no-op
    const spy = vi.spyOn(PathService.prototype, 'ensureWritableDirs');
    await svc.restore();
    expect(spy).not.toHaveBeenCalled();
  });

  test('redoes the copies of an interrupted restore', async () => {
    await buildAndMount();
    await mkdir(`${install}/tools/php/8.0.0.tmp/bin`, { recursive: true });
    await mkdir(`${install}/bin`);
    await writeFile(`${install}/bin/node.tmp`, 'truncated');

    await svc.restore();

    expect(await fs.readdir(`${install}/tools/php`)).toEqual(['8.0.0']);
    expect(await readFile(`${install}/bin/node`, 'utf8')).toBe('wrapper');
    expect(await pathExists(`${install}/bin/node.tmp`)).toBe(false);
  });

  test('copies flagged folders a volume still links to the snapshot', async () => {
    // eg. docker filled the volume from the image, so the stamps match, and
    // an older containerbase restored it
    await buildAndMount(true);
    mountVolume();
    await write('opt/containerbase/.restored', '{}');

    await svc.restore();

    expect(await isRealDir('opt/containerbase/tools/php/8.0.0')).toBe(true);
    expect(await isLink('opt/containerbase/tools/node/24.0.0')).toBe(true);

    // a copied folder is only checked on later runs
    const spy = vi.spyOn(PathService.prototype, 'ensureWritableDirs');
    await svc.restore();
    expect(spy).not.toHaveBeenCalled();
  });

  test('restores a volume docker filled without linked copies', async () => {
    // eg. an image whose flagged folders docker copied into the volume
    await buildAndMount(true);
    mountVolume();
    await rm(`${install}/tools/php/8.0.0`);
    await snapshotSvc.copy(
      `${snapshot}/tools/php/8.0.0`,
      `${install}/tools/php/8.0.0`,
    );

    expect(await svc.needsRestore()).toBe(true);
    await svc.restore();

    expect(await svc.needsRestore()).toBe(false);
    expect(
      Object.keys(JSON.parse(await readFile(`${install}/.restored`, 'utf8'))),
    ).toContain('bin/node');
    // so the build-time database is attached
    const versions = await (await testContainer()).getAsync(VersionService);
    expect(await versions.findInstalled('node')).toEqual([
      { name: 'node', version: '24.0.0' },
    ]);
  });

  test('keeps the result of the check for the process', async () => {
    await buildAndMount();
    const readStamp = vi.spyOn(SnapshotService.prototype, 'readStamp');

    expect(await svc.needsRestore()).toBe(true);
    expect(await svc.needsRestore()).toBe(true);
    expect(await (await child.getAsync(RestoreService)).needsRestore()).toBe(
      true,
    );

    expect(readStamp).toHaveBeenCalledTimes(2);
  });

  test('keeps the links of an image without a volume', async () => {
    await buildAndMount(true);

    await svc.restore();

    expect(await isLink('opt/containerbase/tools/php/8.0.0')).toBe(true);
  });

  test('keeps the links of a read-only image', async () => {
    await buildAndMount(true);
    mountVolume();
    denyAccess('EROFS', install);

    await svc.restore();

    expect(await isLink('opt/containerbase/tools/php/8.0.0')).toBe(true);
  });

  test('keeps a flagged folder linked elsewhere', async () => {
    await buildAndMount(true);
    mountVolume();
    await write('opt/containerbase/.restored', '{}');
    await rm(`${install}/tools/php/8.0.0`);
    await fs.symlink('/other', `${install}/tools/php/8.0.0`);

    await svc.restore();

    expect(await readlink(`${install}/tools/php/8.0.0`)).toBe('/other');
    expect(logger.debug).toHaveBeenCalledWith(
      'restore: /opt/containerbase matches the snapshot',
    );
  });

  test('keeps what the volume already has', async () => {
    await buildAndMount();
    await write('opt/containerbase/bin/node', 'runtime wrapper');
    await write('opt/containerbase/tools/node/24.0.0/bin/node', 'runtime');
    // a database without tombstones, eg. of an older version
    await mkdir(`${install}/data`);
    new DatabaseSync(`${install}/data/containerbase.db`).close();
    await write('var/lib/containerbase/opt/bin/dir/file');
    await write('opt/containerbase/bin/dir', 'a file');

    await svc.restore();

    expect(await readFile(`${install}/bin/dir`, 'utf8')).toBe('a file');
    expect(await readFile(`${install}/bin/node`, 'utf8')).toBe(
      'runtime wrapper',
    );
    expect(await isRealDir('opt/containerbase/tools/node/24.0.0')).toBe(true);
    expect(
      Object.keys(JSON.parse(await readFile(`${install}/.restored`, 'utf8'))),
    ).not.toContain('bin/node');
  });

  test('keeps build-time versions uninstalled at runtime uninstalled', async () => {
    await buildAndMount();
    await svc.restore();
    // uninstall node at runtime, like `uninstall-tool`
    const versions = await (await testContainer()).getAsync(VersionService);
    const node = { name: 'node', version: '24.0.0' };
    await versions.removeInstalled({ name: 'yarn' });
    await versions.removeInstalled(node);
    await versions.removeLinks(node);
    await versions.removeCurrent('node');
    await rm(`${install}/tools/node/24.0.0`);
    await rm(`${install}/tools/yarn/1.0.0/24.0.0`);
    await rm(`${install}/bin/node`);
    // an image update
    await writeFile(`${snapshot}/.stamp`, 'newer');

    await svc.restore();

    expect(await pathExists(`${install}/tools/node/24.0.0`)).toBe(false);
    expect(await pathExists(`${install}/tools/yarn/1.0.0/24.0.0`)).toBe(false);
    expect(await pathExists(`${install}/bin/node`)).toBe(false);
    expect(await pathExists(`${install}/versions/node`)).toBe(false);
    expect(await isRealDir('opt/containerbase/tools/php/8.0.0')).toBe(true);
  });

  test('restores the files of a newer build-time row of the same name', async () => {
    await buildAndMount();
    await svc.restore();
    const versions = await (await testContainer()).getAsync(VersionService);
    const node = { name: 'node', version: '24.0.0' };
    await versions.removeLinks(node);
    await versions.removeCurrent('node');
    await rm(`${install}/bin/node`);
    expect(await pathExists(`${install}/versions/node`)).toBe(false);
    // a newer image links and selects another node version
    const base = new DatabaseSync(`${snapshot}/data/containerbase.db`);
    base.exec(`
      UPDATE links SET tool_version = '26.0.0';
      UPDATE state SET tool_version = '26.0.0';
    `);
    base.close();
    await writeFile(`${snapshot}/bin/node`, 'wrapper 26');
    await writeFile(`${snapshot}/versions/node`, '26.0.0');
    await writeFile(`${snapshot}/.stamp`, 'newer');

    await svc.restore();

    expect(await readFile(`${install}/bin/node`, 'utf8')).toBe('wrapper 26');
    expect(await readFile(`${install}/versions/node`, 'utf8')).toBe('26.0.0');
  });

  test('rolls back a journal left on the volume before reading it', async () => {
    await buildAndMount();
    await svc.restore();
    const versions = await (await testContainer()).getAsync(VersionService);
    await versions.removeLinks({ name: 'node', version: '24.0.0' });
    await rm(`${install}/bin/node`);
    // an interrupted writer
    await writeFile(`${install}/data/containerbase.db-journal`, '');
    await writeFile(`${snapshot}/.stamp`, 'newer');
    const close = vi.spyOn(DatabaseSync.prototype, 'close');

    await svc.restore();

    // a writable connection is opened and closed before the read-only one
    expect(close).toHaveBeenCalledTimes(2);
    expect(await pathExists(`${install}/bin/node`)).toBe(false);
  });

  test('adopts files equal to the snapshot', async () => {
    await buildAndMount();
    // eg. docker copied the image's files into the volume
    await snapshotSvc.copy(`${snapshot}/bin`, `${install}/bin`);

    await svc.restore();

    const restored = JSON.parse(await readFile(`${install}/.restored`, 'utf8'));
    expect(Object.keys(restored)).toEqual(
      expect.arrayContaining(['bin/node', 'bin/nodejs']),
    );
  });

  test('treats an unreadable record as empty', async () => {
    await buildAndMount();
    await write('opt/containerbase/.restored', 'not json');

    await svc.restore();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ file: `${install}/.restored` }),
      'restore: ignoring an unreadable record',
    );
    await writeFile(`${snapshot}/.stamp`, 'newer');
    await writeFile(`${install}/.restored`, 'null');

    await svc.restore();

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(await readFile(`${install}/bin/node`, 'utf8')).toBe('wrapper');
  });

  test('updates a volume of an older image', async () => {
    await buildAndMount();
    await svc.restore();
    // the volume changes one restored file and adds one
    await writeFile(`${install}/bin/nodejs.txt`, 'own');
    await rm(`${install}/bin/nodejs`);
    await fs.symlink('other', `${install}/bin/nodejs`);
    // the new image: a new wrapper, a removed file and a removed version
    await writeFile(`${snapshot}/bin/node`, 'new wrapper');
    await write('var/lib/containerbase/opt/bin/old', 'old');
    await writeFile(`${snapshot}/.stamp`, 'newer');
    await svc.restore();
    expect(await readFile(`${install}/bin/old`, 'utf8')).toBe('old');
    await rm(`${snapshot}/bin/old`);
    await rm(`${snapshot}/bin/nodejs`);
    await rm(`${snapshot}/tools/node/24.0.0`, { recursive: true });
    await writeFile(`${snapshot}/.stamp`, 'new');

    await svc.restore();

    expect(await readFile(`${install}/bin/node`, 'utf8')).toBe('new wrapper');
    expect(await pathExists(`${install}/bin/old`)).toBe(false);
    expect(await readlink(`${install}/bin/nodejs`)).toBe('other');
    expect(await readFile(`${install}/bin/nodejs.txt`, 'utf8')).toBe('own');
    expect(
      await fs.lstat(`${install}/tools/node/24.0.0`).catch(() => null),
    ).toBeNull();
    expect(await isRealDir('opt/containerbase/tools/php/8.0.0')).toBe(true);
  });

  test('removes folders left empty by an older snapshot', async () => {
    await buildAndMount();
    await write('var/lib/containerbase/opt/bin/sub/deep/old', 'old');
    await write('var/lib/containerbase/opt/bin/other/old', 'old');
    await writeFile(`${snapshot}/.stamp`, 'newer');
    await svc.restore();
    // the volume adds a file next to one restored file
    await writeFile(`${install}/bin/other/own`, 'own');
    await rm(`${snapshot}/bin/sub`, { recursive: true });
    await rm(`${snapshot}/bin/other`, { recursive: true });
    await writeFile(`${snapshot}/.stamp`, 'new');

    await svc.restore();

    expect(await pathExists(`${install}/bin/sub`)).toBe(false);
    expect(await fs.readdir(`${install}/bin/other`)).toEqual(['own']);
    expect(await isRealDir('opt/containerbase/bin')).toBe(true);
  });

  test('fails when a folder left empty cannot be removed', async () => {
    await buildAndMount();
    await write('var/lib/containerbase/opt/bin/sub/old', 'old');
    await writeFile(`${snapshot}/.stamp`, 'newer');
    await svc.restore();
    await rm(`${snapshot}/bin/sub`, { recursive: true });
    await writeFile(`${snapshot}/.stamp`, 'new');
    vi.spyOn(fs, 'rmdir').mockRejectedValueOnce(
      Object.assign(new Error('EPERM'), { code: 'EPERM' }),
    );

    await expect(svc.restore()).rejects.toThrow('EPERM');
  });

  test('gives the restored files and copies to the user as root', async () => {
    await buildAndMount();
    vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);
    const envSvc = await child.getAsync(EnvService);
    const lchown = vi.spyOn(fs, 'lchown').mockResolvedValue();
    const setOwner = vi.spyOn(PathService.prototype, 'setOwner');

    await svc.restore();

    expect(setOwner).toHaveBeenCalledWith({ path: install });
    expect(lchown).toHaveBeenCalledWith(
      `${install}/bin/node.tmp`,
      envSvc.userId,
      0,
    );
    expect(lchown).toHaveBeenCalledWith(
      expect.stringContaining(`${install}/tools/php/8.0.0.`),
      envSvc.userId,
      0,
    );
  });

  test('fails on an unwritable volume without changes', async () => {
    await buildAndMount();
    denyAccess('EACCES', install);

    await expect(svc.restore()).rejects.toThrow(
      `EACCES: can't write to ${install}`,
    );

    expect(await fs.readdir(install)).toEqual([]);
  });

  test('skips a listed folder missing in the snapshot', async () => {
    await buildAndMount();
    await write('var/lib/containerbase/opt/.links', 'l tools/gone/1.0.0\n');

    await svc.restore();

    expect(await pathExists(`${install}/tools/gone`)).toBe(false);
  });

  test('restores without a list of folders and a database', async () => {
    await write('opt/containerbase/bin/node', 'wrapper');
    await snapshotSvc.snapshotFiles();
    await rm(`${snapshot}/.links`);
    await rm(install, { recursive: true });
    await mkdir(install);

    await svc.restore();

    expect(await readFile(`${install}/bin/node`, 'utf8')).toBe('wrapper');
    expect(await pathExists(`${install}/data/containerbase.db`)).toBe(false);
  });
});
