import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getDistro } from '../utils/index.ts';
import { AptService } from './index.ts';
import { testContainer } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('execa', () => ({ execa: mocks.execa }));
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  getDistro: vi.fn(),
}));
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

  describe('installDistroPackages', () => {
    const distroPackages = { noble: ['libssl3t64'] };

    test('installs the common and the distro packages', async () => {
      vi.mocked(getDistro).mockResolvedValueOnce({
        name: 'Ubuntu',
        versionCode: 'noble',
        versionId: '24.04',
      });
      // empty `dpkg -s` output: not installed yet
      mocks.execa.mockResolvedValue({ stdout: '' });

      await svc.installDistroPackages('dummy', distroPackages, 'zlib1g');

      expect(mocks.execa).toHaveBeenCalledWith(
        'apt-get',
        ['-qq', 'install', '-y', 'zlib1g', 'libssl3t64'],
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
    });

    test('throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValueOnce({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });

      await expect(
        svc.installDistroPackages('dummy', distroPackages),
      ).rejects.toThrow(
        "Tool 'dummy' not supported on: focal! Please use ubuntu 'jammy', 'noble' or 'resolute'.",
      );
      expect(mocks.execa).not.toHaveBeenCalled();
    });
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
