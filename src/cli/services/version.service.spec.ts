import { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { VersionService } from '.';
import { testContainer } from '~test/di';
import { ensurePaths } from '~test/path';

describe('cli/services/version.service', () => {
  let child!: Container;
  let svc!: VersionService;

  beforeAll(async () => {
    await ensurePaths('opt/containerbase/data');
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
      tool: { name: 'node', version: '14.17.0' },
    });
    await svc.addInstalled({
      name: 'pnpm',
      version: '10.0.1',
      tool: { name: 'node', version: '14.17.1' },
    });

    await expect(
      svc.addInstalled({
        name: 'pnpm',
        version: '10.0.1',
        tool: { name: 'node', version: '14.17.1' },
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
        tool: { name: 'node', version: '14.17.0' },
      }),
    ).toBe(true);
    expect(
      await svc.isInstalled({
        name: 'pnpm',
        version: '10.0.1',
        tool: { name: 'node', version: '14.17.1' },
      }),
    ).toBe(true);
    expect(
      await svc.isInstalled({
        name: 'pnpm',
        version: '10.0.1',
        tool: { name: 'node', version: '14.17.2' },
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
});
