import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AptService, rootContainer } from '.';

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('execa', () => mocks);
vi.mock('node:fs/promises', async () => ({
  default: { ...(await vi.importActual<any>('node:fs/promises')), ...mocks },
  ...mocks,
}));

describe('apt.service', () => {
  let child!: Container;

  beforeEach(() => {
    child = rootContainer.createChild();
    delete env.APT_HTTP_PROXY;
  });

  test('skips install', async () => {
    const svc = child.get(AptService);

    mocks.execa.mockResolvedValueOnce({
      stdout: 'Status: install ok installed',
    });
    await svc.install('some-pkg');
    expect(mocks.execa).toHaveBeenCalledTimes(1);
  });

  test('works', async () => {
    const svc = child.get(AptService);

    mocks.execa.mockRejectedValueOnce(new Error('not installed'));
    await svc.install('some-pkg');
    expect(mocks.execa).toHaveBeenCalledTimes(3);
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });

  test('uses proxy', async () => {
    env.APT_HTTP_PROXY = 'http://proxy';
    const svc = child.get(AptService);

    mocks.execa.mockRejectedValueOnce(new Error('not installed'));
    await svc.install('some-pkg', 'other-pkg');
    expect(mocks.execa).toHaveBeenCalledTimes(4);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.rm).toHaveBeenCalledOnce();
  });
});
