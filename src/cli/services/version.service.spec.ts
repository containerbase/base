import fs from 'node:fs/promises';
import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils';
import { VersionService } from '.';
import { testContainer } from '~test/di';
import { ensurePaths, rootPath } from '~test/path';

describe('cli/services/version.service', () => {
  let child!: Container;
  let svc!: VersionService;
  const now = new Date('2025-09-16T07:58:26.631Z');

  beforeAll(async () => {
    await ensurePaths(['opt/containerbase/data', 'opt/containerbase/versions']);
    vi.useFakeTimers({ now });
  });

  beforeEach(async () => {
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
    ).rejects.toThrow();

    expect(await svc.isInstalled({ name: 'node', version: '14.17.0' })).toBe(
      true,
    );
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

    expect(await svc.getChilds({ name: 'node', version: '14.17.0' })).toEqual([
      {
        _id: expect.any(String),
        createdAt: now,
        name: 'pnpm',
        parent: {
          name: 'node',
          version: '14.17.0',
        },
        updatedAt: now,
        version: '10.0.1',
      },
    ]);

    await svc.removeInstalled({ name: 'pnpm' });
    expect(
      await svc.isInstalled({
        name: 'pnpm',
        version: '10.0.1',
        parent: { name: 'node', version: '14.17.1' },
      }),
    ).toBe(false);
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

    expect(
      await svc.isLinked({
        name: 'node',
        tool: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(true);

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
