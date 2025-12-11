import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AptService } from '.';
import { testContainer } from '~test/di';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('nano-spawn', () => ({ default: mocks.spawn }));
vi.mock('node:fs/promises', async (importActual) => ({
  default: { ...(await importActual<any>()), ...mocks },
  ...mocks,
}));

describe('cli/services/apt.service', () => {
  let child!: Container;
  let svc!: AptService;

  beforeEach(async () => {
    child = await testContainer();
    svc = await child.getAsync(AptService);
    delete env.APT_HTTP_PROXY;
  });

  test('skips install', async () => {
    mocks.spawn.mockResolvedValueOnce({
      stdout: 'Status: install ok installed',
    });
    await svc.install('some-pkg');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  test('works', async () => {
    mocks.spawn.mockRejectedValueOnce(new Error('not installed'));
    await svc.install('some-pkg');
    expect(mocks.spawn).toHaveBeenCalledTimes(3);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });

  test('uses proxy', async () => {
    env.APT_HTTP_PROXY = 'http://proxy';
    mocks.spawn.mockRejectedValueOnce(new Error('not installed'));
    await svc.install('some-pkg', 'other-pkg');
    expect(mocks.spawn).toHaveBeenCalledTimes(4);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.rm).toHaveBeenCalledOnce();
  });
});
