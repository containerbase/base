import fs from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Container } from 'inversify';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { logger } from '../utils/index.ts';
import { DataService, RestoreService, VersionService } from './index.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

describe('cli/services/version.service', () => {
  let child!: Container;
  let svc!: VersionService;

  beforeAll(async () => {
    await ensurePaths(['opt/containerbase/data', 'opt/containerbase/versions']);
  });

  beforeEach(async () => {
    // every test starts with an empty database
    await fs.rm(rootPath('opt/containerbase/data/containerbase.db'), {
      force: true,
    });
    child = await testContainer();
    svc = await child.getAsync(VersionService);
  });

  test('installed', async () => {
    expect(await svc.isInstalled({ name: 'node', version: '14.17.0' })).toBe(
      false,
    );

    await svc.addInstalled({ name: 'node', version: '14.17.0' });
    await svc.addInstalled({
      name: 'pnpm',
      version: '10.0.1',
      parent: { name: 'node', version: '14.17.0' },
    });
    await svc.addInstalled({
      name: 'pnpm',
      version: '10.0.1',
      parent: { name: 'node', version: '14.17.1' },
    });

    await expect(
      svc.addInstalled({
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.1' },
      }),
    ).rejects.toThrow('UNIQUE constraint failed');
    await expect(
      svc.addInstalled({ name: 'node', version: '14.17.0' }),
    ).rejects.toThrow('UNIQUE constraint failed');

    expect(await svc.findInstalled('node')).toEqual([
      { name: 'node', version: '14.17.0' },
    ]);
    expect(await svc.findInstalled('pnpm')).toEqual([
      {
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.0' },
      },
      {
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.1' },
      },
    ]);

    expect(await svc.isInstalled({ name: 'node', version: '14.17.0' })).toBe(
      true,
    );
    // without a parent any parent matches
    expect(await svc.isInstalled({ name: 'pnpm', version: '10.0.1' })).toBe(
      true,
    );
    expect(
      await svc.isInstalled({
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(true);
    expect(
      await svc.isInstalled({
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.1' },
      }),
    ).toBe(true);
    expect(
      await svc.isInstalled({
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.2' },
      }),
    ).toBe(false);
    // a parent doesn't match a version installed without one
    expect(
      await svc.isInstalled({
        name: 'node',
        version: '14.17.0',
        parent: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(false);

    expect(await svc.getChilds({ name: 'node', version: '14.17.0' })).toEqual([
      {
        name: 'pnpm',
        parent: {
          name: 'node',
          version: '14.17.0',
        },
        version: '10.0.1',
      },
    ]);
    expect(await svc.getChilds({ name: 'node', version: '14.17.2' })).toEqual(
      [],
    );

    // only the given parent is removed
    await svc.removeInstalled({
      name: 'pnpm',
      parent: { name: 'node', version: '14.17.0' },
    });
    expect(await svc.findInstalled('pnpm')).toEqual([
      {
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.1' },
      },
    ]);

    // other versions are kept
    await svc.removeInstalled({ name: 'node', version: '14.17.1' });
    expect(await svc.findInstalled('node')).toHaveLength(1);

    await svc.removeInstalled({ name: 'pnpm' });
    expect(
      await svc.isInstalled({
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.1' },
      }),
    ).toBe(false);

    await svc.removeInstalled({ version: '14.17.0' });
    expect(await svc.findInstalled('node')).toEqual([]);
  });

  test('list installed', async () => {
    expect(await svc.listInstalled()).toEqual([]);

    await svc.addInstalled({ name: 'node', version: '22.11.0' });
    await svc.addInstalled({ name: 'node', version: '9.11.0' });
    await svc.addInstalled({
      name: 'pnpm',
      version: '10.0.1',
      parent: { name: 'node', version: '22.11.0' },
    });
    await svc.addInstalled({ name: 'java-jdk', version: '21.0.12+7' });
    await svc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: '22.11.0' },
    });
    await svc.setCurrent({
      name: 'java',
      tool: { name: 'java-jdk', version: '21.0.12+7' },
    });
    await svc.setType('pnpm', 'npm');

    expect(await svc.listInstalled()).toEqual([
      {
        name: 'java-jdk',
        version: '21.0.12+7',
        versions: [{ version: '21.0.12+7' }],
      },
      {
        name: 'node',
        version: '22.11.0',
        versions: [{ version: '9.11.0' }, { version: '22.11.0' }],
      },
      {
        name: 'pnpm',
        version: null,
        versions: [
          { version: '10.0.1', parent: { name: 'node', version: '22.11.0' } },
        ],
        type: 'npm',
      },
    ]);
  });

  test('linked', async () => {
    expect(
      await svc.isLinked({
        name: 'node',
        tool: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(false);

    await svc.setLink({
      name: 'node',
      tool: { name: 'node', version: '14.17.0' },
    });
    await svc.setLink({
      name: 'npx',
      tool: { name: 'node', version: '14.17.0' },
    });

    expect(
      await svc.isLinked({
        name: 'node',
        tool: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(true);
    expect(await svc.findLinks({ name: 'node', version: '14.17.0' })).toEqual([
      { name: 'node', tool: { name: 'node', version: '14.17.0' } },
      { name: 'npx', tool: { name: 'node', version: '14.17.0' } },
    ]);

    await svc.setLink({
      name: 'node',
      tool: { name: 'node', version: '14.11.0' },
    });

    expect(
      await svc.isLinked({
        name: 'node',
        tool: { name: 'node', version: '14.10.0' },
      }),
    ).toBe(false);
    expect(
      await svc.isLinked({
        name: 'node',
        tool: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(false);
    expect(
      await svc.isLinked({
        name: 'node',
        tool: { name: 'node', version: '14.11.0' },
      }),
    ).toBe(true);

    await svc.removeLinks({ name: 'node', version: '14.17.0' });
    expect(await svc.findLinks({ name: 'node', version: '14.17.0' })).toEqual(
      [],
    );
    expect(await svc.findLinks({ name: 'node', version: '14.11.0' })).toEqual([
      { name: 'node', tool: { name: 'node', version: '14.11.0' } },
    ]);
  });

  test('current', async () => {
    const versionFile = rootPath('opt/containerbase/versions/node');

    expect(await svc.getCurrent('node')).toBeNull();

    await svc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: '14.17.0' },
    });
    expect(
      await svc.isCurrent({
        name: 'node',
        tool: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(true);
    expect(
      await svc.isCurrent({
        name: 'node',
        tool: { name: 'node', version: '14.17.1' },
      }),
    ).toBe(false);
    expect(await svc.getCurrent('node')).toStrictEqual({
      name: 'node',
      tool: { name: 'node', version: '14.17.0' },
    });

    // creates the version file with the expected rights
    await svc.update('node', '14.17.0');
    await fs.chmod(versionFile, 0o600);
    // the rights are corrected on the next write
    await svc.update('node', '14.17.1');
    expect((await fs.stat(versionFile)).mode & 0o777).toBe(0o664);

    await svc.removeCurrent('node');
    expect(await svc.getCurrent('node')).toBeNull();
    await expect(fs.stat(versionFile)).rejects.toThrow();

    // the version file is gone now
    await svc.removeCurrent('node');
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { tool: 'node', err: expect.any(Error) },
      'tool version file not found',
    );
  });

  test('current with parent', async () => {
    const parent = { name: 'node', version: '22.11.0' };
    await svc.setCurrent({
      name: 'pnpm',
      tool: { name: 'pnpm', version: '10.0.1' },
      parent,
    });

    expect(await svc.getCurrent('pnpm')).toEqual({
      name: 'pnpm',
      tool: { name: 'pnpm', version: '10.0.1' },
      parent,
    });
    // without a parent any parent matches
    expect(
      await svc.isCurrent({
        name: 'pnpm',
        tool: { name: 'pnpm', version: '10.0.1' },
      }),
    ).toBe(true);
    expect(
      await svc.isCurrent({
        name: 'pnpm',
        tool: { name: 'pnpm', version: '10.0.1' },
        parent,
      }),
    ).toBe(true);
    expect(
      await svc.isCurrent({
        name: 'pnpm',
        tool: { name: 'pnpm', version: '10.0.1' },
        parent: { name: 'node', version: '20.11.0' },
      }),
    ).toBe(false);

    // replacing the current version drops the parent
    await svc.setCurrent({
      name: 'pnpm',
      tool: { name: 'pnpm', version: '10.0.2' },
    });
    expect(await svc.getCurrent('pnpm')).toStrictEqual({
      name: 'pnpm',
      tool: { name: 'pnpm', version: '10.0.2' },
    });
    expect(
      await svc.isCurrent({
        name: 'pnpm',
        tool: { name: 'pnpm', version: '10.0.2' },
        parent,
      }),
    ).toBe(false);
  });

  test('types', async () => {
    expect(await svc.getType('pnpm')).toBeUndefined();
    expect(await svc.getTypes()).toEqual([]);

    await svc.setType('pnpm', 'pip');
    await svc.setType('pnpm', 'npm');
    await svc.setType('rake', 'gem');

    expect(await svc.getType('pnpm')).toBe('npm');
    expect(await svc.getTypes()).toEqual([
      { name: 'pnpm', type: 'npm' },
      { name: 'rake', type: 'gem' },
    ]);

    // without a type the tool is forgotten
    await svc.setType('pnpm', undefined);
    expect(await svc.getType('pnpm')).toBeUndefined();
    expect(await svc.getTypes()).toEqual([{ name: 'rake', type: 'gem' }]);
  });

  test('update only writes a changed version file', async () => {
    const versionFile = rootPath('opt/containerbase/versions/java');
    const past = new Date('2020-01-01T00:00:00.000Z');

    await svc.update('java', '21.0.1');
    await fs.utimes(versionFile, past, past);

    // same content, the file is left untouched
    await svc.update('java', '21.0.1');
    expect((await fs.stat(versionFile)).mtime).toEqual(past);

    // changed content, the file is written
    await svc.update('java', '21.0.2');
    expect((await fs.stat(versionFile)).mtime).not.toEqual(past);
    expect(await fs.readFile(versionFile, 'utf8')).toBe('21.0.2');
  });

  test('legacy', async () => {
    await expect(svc.update('node', '14.17.0')).resolves.toBeUndefined();

    await fs.rm(rootPath('opt/containerbase/versions'), {
      force: true,
      recursive: true,
    });
    await expect(svc.update('node', '14.17.0')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { tool: 'node', err: expect.any(Error) },
      'tool version not found',
    );
  });

  describe('on a restored volume', () => {
    let base!: string;
    let dbFile!: string;

    beforeAll(() => {
      base = rootPath('var/lib/containerbase/opt/data/containerbase.db');
      dbFile = rootPath('opt/containerbase/data/containerbase.db');
    });

    afterEach(async () => {
      await fs.rm(rootPath('opt/containerbase/.restored'), { force: true });
      await fs.rm(rootPath('var/lib/containerbase/opt'), {
        recursive: true,
        force: true,
      });
    });

    /**
     * Records the build-time state with `fill`, moves the database into the
     * snapshot and returns a service on an empty restored volume.
     */
    async function build(
      fill: (svc: VersionService) => Promise<void>,
    ): Promise<VersionService> {
      await fs.rm(rootPath('opt/containerbase/.restored'), { force: true });
      await fs.rm(dbFile, { force: true });
      const buildChild = await testContainer();
      await fill(await buildChild.getAsync(VersionService));
      (await (await buildChild.getAsync(DataService)).db()).close();
      await fs.mkdir(dirname(base), { recursive: true });
      await fs.rename(dbFile, base);
      // the snapshot is read-only for the volume
      await fs.chmod(base, 0o444);
      await fs.writeFile(rootPath('opt/containerbase/.restored'), '{}');
      return (await testContainer()).getAsync(VersionService);
    }

    /** Records some tools like an image build. */
    async function image(svc: VersionService): Promise<void> {
      await svc.addInstalled({ name: 'node', version: '22.0.0' });
      await svc.addInstalled({
        name: 'pnpm',
        version: '10.0.0',
        parent: { name: 'node', version: '22.0.0' },
      });
      await svc.setCurrent({
        name: 'node',
        tool: { name: 'node', version: '22.0.0' },
      });
      await svc.setLink({
        name: 'node',
        tool: { name: 'node', version: '22.0.0' },
      });
      await svc.setType('pnpm', 'npm');
    }

    test('reads the build-time state, writes only to the volume', async () => {
      const vol = await build(image);

      await vol.addInstalled({ name: 'node', version: '24.0.0' });
      await vol.setType('yarn', 'npm');

      expect(await vol.findInstalled('node')).toEqual([
        { name: 'node', version: '22.0.0' },
        { name: 'node', version: '24.0.0' },
      ]);
      expect(await vol.getCurrent('node')).toEqual({
        name: 'node',
        tool: { name: 'node', version: '22.0.0' },
      });
      expect(
        await vol.isLinked({
          name: 'node',
          tool: { name: 'node', version: '22.0.0' },
        }),
      ).toBe(true);
      expect(await vol.getTypes()).toEqual([
        { name: 'pnpm', type: 'npm' },
        { name: 'yarn', type: 'npm' },
      ]);
      // only tools with a version are listed
      expect((await vol.listInstalled()).map((t) => t.name)).toEqual([
        'node',
        'pnpm',
      ]);

      // the volume database only holds the runtime state
      const db = new DatabaseSync(dbFile, { readOnly: true });
      try {
        expect(
          db.prepare('SELECT name, version FROM main.versions').all(),
        ).toEqual([{ name: 'node', version: '24.0.0' }]);
      } finally {
        db.close();
      }
    });

    test('the volume overrides the build-time state by name', async () => {
      const vol = await build(image);

      await vol.addInstalled({ name: 'node', version: '22.0.0' });
      await vol.setCurrent({
        name: 'node',
        tool: { name: 'node', version: '24.0.0' },
      });
      await vol.setLink({
        name: 'node',
        tool: { name: 'node', version: '24.0.0' },
      });
      await vol.setType('pnpm', 'gem');

      // a version recorded in both is listed once
      expect(await vol.findInstalled('node')).toEqual([
        { name: 'node', version: '22.0.0' },
      ]);
      expect(await vol.getCurrent('node')).toMatchObject({
        tool: { version: '24.0.0' },
      });
      expect(await vol.findLinks({ name: 'node', version: '22.0.0' })).toEqual(
        [],
      );
      expect(await vol.getType('pnpm')).toBe('gem');
    });

    test('an overridden build-time link stays removed', async () => {
      const vol = await build(image);
      const node = { name: 'node', version: '24.0.0' };

      await vol.setLink({ name: 'node', tool: node });
      await vol.removeLinks(node);

      expect(await vol.findLinks({ name: 'node', version: '22.0.0' })).toEqual(
        [],
      );
      expect(await vol.findLinks(node)).toEqual([]);

      // linking the build-time version again lifts the tombstone
      await vol.setLink({
        name: 'node',
        tool: { name: 'node', version: '22.0.0' },
      });
      expect(
        await vol.findLinks({ name: 'node', version: '22.0.0' }),
      ).toHaveLength(1);
    });

    test('tombstones hide build-time rows until they are added again', async () => {
      const vol = await build(image);
      const node = { name: 'node', version: '22.0.0' };

      await vol.removeInstalled({ name: 'pnpm' });
      await vol.removeLinks(node);
      await vol.removeCurrent('node');
      await vol.setType('pnpm', undefined);
      // removing it twice is fine
      await vol.removeInstalled({ name: 'pnpm' });

      expect(await vol.findInstalled('pnpm')).toEqual([]);
      expect(await vol.findLinks(node)).toEqual([]);
      expect(await vol.getCurrent('node')).toBeNull();
      expect(await vol.getType('pnpm')).toBeUndefined();

      await vol.addInstalled({
        name: 'pnpm',
        version: '10.0.0',
        parent: node,
      });
      await vol.setLink({ name: 'node', tool: node });
      await vol.setCurrent({ name: 'node', tool: node });
      await vol.setType('pnpm', 'npm');

      expect(await vol.findInstalled('pnpm')).toEqual([
        { name: 'pnpm', version: '10.0.0', parent: node },
      ]);
      expect(await vol.findLinks(node)).toEqual([{ name: 'node', tool: node }]);
      expect(await vol.getCurrent('node')).toEqual({
        name: 'node',
        tool: node,
      });
      expect(await vol.getType('pnpm')).toBe('npm');

      // without tombstones, the build-time rows show up again
      await vol.removeInstalled({ name: 'pnpm' });
      await vol.removeCurrent('node');
      await vol.removeLinks(node);
      await vol.setType('pnpm', undefined);
      const db = new DatabaseSync(dbFile);
      db.prepare('DELETE FROM main.tombstones').run();
      db.close();
      const again = await (await testContainer()).getAsync(VersionService);
      expect(await again.findInstalled('pnpm')).toHaveLength(1);
      expect(await again.getCurrent('node')).not.toBeNull();
    });

    test('an image update brings its build-time state', async () => {
      let vol = await build(image);
      await vol.addInstalled({ name: 'yarn', version: '1.0.0' });
      const runtime = new DatabaseSync(dbFile, { readOnly: true });
      const kept = runtime.prepare('SELECT * FROM main.versions').all();
      runtime.close();
      await fs.rename(dbFile, `${dbFile}.keep`);

      vol = await build(async (svc) => {
        await svc.addInstalled({ name: 'node', version: '24.0.0' });
      });
      await fs.rm(dbFile, { force: true });
      await fs.rename(`${dbFile}.keep`, dbFile);
      vol = await (await testContainer()).getAsync(VersionService);

      expect(kept).toHaveLength(1);
      expect(await vol.findInstalled('node')).toEqual([
        { name: 'node', version: '24.0.0' },
      ]);
      expect(await vol.findInstalled('pnpm')).toEqual([]);
      expect(await vol.findInstalled('yarn')).toEqual([
        { name: 'yarn', version: '1.0.0' },
      ]);
    });

    /**
     * Replaces the build-time database by one recorded with `fill`, keeping
     * the database of the volume, like an image update.
     */
    async function update(
      fill: (svc: VersionService) => Promise<void>,
    ): Promise<VersionService> {
      await fs.rename(dbFile, `${dbFile}.keep`);
      await build(fill);
      await fs.rename(`${dbFile}.keep`, dbFile);
      return (await testContainer()).getAsync(VersionService);
    }

    /** Records node 22 and 24 like a newer image build, 24 is current. */
    async function newerImage(svc: VersionService): Promise<void> {
      await svc.addInstalled({ name: 'node', version: '22.0.0' });
      await svc.addInstalled({ name: 'node', version: '24.0.0' });
      await svc.setCurrent({
        name: 'node',
        tool: { name: 'node', version: '24.0.0' },
      });
      await svc.setLink({
        name: 'node',
        tool: { name: 'node', version: '24.0.0' },
      });
      await svc.setType('pnpm', 'gem');
    }

    test('a tombstone only hides the exact build-time row', async () => {
      let vol = await build(image);
      const node = { name: 'node', version: '22.0.0' };
      await vol.removeInstalled(node);
      await vol.removeLinks(node);
      await vol.removeCurrent('node');
      await vol.setType('pnpm', undefined);

      vol = await update(newerImage);

      // the uninstalled version stays uninstalled
      expect(await vol.findInstalled('node')).toEqual([
        { name: 'node', version: '24.0.0' },
      ]);
      expect(await vol.getCurrent('node')).toMatchObject({
        tool: { version: '24.0.0' },
      });
      expect(
        await vol.findLinks({ name: 'node', version: '24.0.0' }),
      ).toMatchObject([{ name: 'node' }]);
      expect(await vol.getType('pnpm')).toBe('gem');
    });

    test('runtime rows equal to build-time rows are kept', async () => {
      let vol = await build(image);
      // the runtime state equals the build-time state, eg. node 22 was
      // installed at runtime before an image installed it at build time
      await fs.copyFile(base, dbFile);
      await fs.chmod(dbFile, 0o664);
      vol = await (await testContainer()).getAsync(VersionService);
      expect(await vol.findInstalled('node')).toEqual([
        { name: 'node', version: '22.0.0' },
      ]);
      const copy = new DatabaseSync(dbFile, { readOnly: true });
      try {
        expect(copy.prepare('SELECT * FROM main.versions').all()).toHaveLength(
          2,
        );
      } finally {
        copy.close();
      }

      // so they stay when a newer image no longer has node 22
      vol = await update(async (svc) => {
        await svc.addInstalled({ name: 'node', version: '24.0.0' });
      });
      expect(await vol.findInstalled('node')).toEqual([
        { name: 'node', version: '24.0.0' },
        { name: 'node', version: '22.0.0' },
      ]);
      expect(await vol.getCurrent('node')).toMatchObject({
        tool: { version: '22.0.0' },
      });
      expect(await vol.getType('pnpm')).toBe('npm');
    });

    test('attaches the build-time database to a volume to restore', async () => {
      await build(image);
      await fs.rm(rootPath('opt/containerbase/.restored'));

      // without a volume to restore nothing is attached
      let vol = await (await testContainer()).getAsync(VersionService);
      expect(await vol.findInstalled('node')).toEqual([]);

      vi.spyOn(RestoreService.prototype, 'needsRestore').mockResolvedValue(
        true,
      );
      const child = await testContainer();
      (await child.getAsync(DataService)).readOnly();
      vol = await child.getAsync(VersionService);
      expect(await vol.isInstalled({ name: 'node', version: '22.0.0' })).toBe(
        true,
      );
    });
  });
});
