import fs from 'node:fs/promises';
import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { logger } from '../utils/index.ts';
import { VersionService } from './index.ts';
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
});
