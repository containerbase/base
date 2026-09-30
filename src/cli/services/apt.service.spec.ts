import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AptService } from './index.ts';
import { testContainer } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('execa', () => ({ execa: mocks.execa }));
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
    vi.stubEnv('APT_HTTP_PROXY', undefined);
  });

  test('skips install', async () => {
    mocks.execa.mockResolvedValueOnce({
      stdout: 'Status: install ok installed',
    });
    await svc.install('some-pkg');
    expect(mocks.execa).toHaveBeenCalledTimes(1);
  });

  test('works', async () => {
    mocks.execa.mockRejectedValueOnce(new Error('not installed'));
    await svc.install('some-pkg');
    expect(mocks.execa).toHaveBeenCalledTimes(3);
    expect(mocks.execa).toHaveBeenCalledWith('apt-get', ['-qq', 'update'], {
      env: { DEBIAN_FRONTEND: 'noninteractive' },
    });
    expect(mocks.execa).toHaveBeenCalledWith(
      'apt-get',
      ['-qq', 'install', '-y', 'some-pkg'],
      { env: { DEBIAN_FRONTEND: 'noninteractive' } },
    );
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });

  test('uses proxy', async () => {
    vi.stubEnv('APT_HTTP_PROXY', 'http://proxy');
    mocks.execa.mockRejectedValueOnce(new Error('not installed'));
    await svc.install('some-pkg', 'other-pkg');
    expect(mocks.execa).toHaveBeenCalledTimes(4);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.rm).toHaveBeenCalledOnce();
  });
});
