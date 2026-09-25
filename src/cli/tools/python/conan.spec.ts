import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  EnvService,
  PathService,
  VersionService,
} from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';
import {
  ConanInstallService,
  ConanPrepareService,
  ConanVersionResolver,
} from './conan.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const pythonVersion = '3.13.0';

describe('cli/tools/python/conan', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'opt/containerbase/versions',
    ]);

    const verSvc = await (await testContainer()).getAsync(VersionService);
    await verSvc.setCurrent({
      name: 'python',
      tool: { name: 'python', version: pythonVersion },
    });
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({ failed: false, all: 'ok' });
  });

  describe('ConanInstallService', () => {
    test('install', async () => {
      const { svc } = await toolContext(ConanInstallService);

      await expect(svc.install('2.9.2')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        expect.stringContaining('bin/python'),
        expect.arrayContaining(['conan==2.9.2']),
        expect.any(Object),
      );
    });
  });

  describe('ConanPrepareService', () => {
    test.each([
      { hostArch: 'x64', code: 'jammy', cpu: 'x86_64', compiler: '11' },
      { hostArch: 'arm64', code: 'noble', cpu: 'armv8', compiler: '13' },
      { hostArch: 'x64', code: 'resolute', cpu: 'x86_64', compiler: '15' },
    ] as const)(
      'prepare on $code/$cpu',
      async ({ hostArch, code, cpu, compiler }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        vi.mocked(getDistro).mockResolvedValue({
          name: 'Ubuntu',
          versionCode: code,
          versionId: '24.04',
        });
        const { svc, child } = await toolContext(ConanPrepareService);
        const pathSvc = await child.getAsync(PathService);
        const envSvc = await child.getAsync(EnvService);
        await fs.rm(join(envSvc.userHome, '.conan2'), { force: true });

        await expect(svc.prepare()).resolves.toBeUndefined();

        const profile = await fs.readFile(
          join(pathSvc.cachePath, '.conan2', 'profiles', 'default'),
          'utf8',
        );
        expect(profile).toContain(`arch=${cpu}`);
        expect(profile).toContain(`compiler.version=${compiler}`);
        expect(execaMock).toHaveBeenCalledWith(
          'apt-get',
          expect.arrayContaining(['cmake', 'gcc']),
          { env: { DEBIAN_FRONTEND: 'noninteractive' } },
        );
        expect(await fs.readlink(join(envSvc.userHome, '.conan2'))).toBe(
          join(pathSvc.cachePath, '.conan2'),
        );
      },
    );

    test('initialize: throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(ConanPrepareService);

      await expect(svc.initialize()).rejects.toThrow('Unsupported distro');
    });
  });

  describe('ConanVersionResolver', () => {
    test('resolves latest', async () => {
      scope('https://pypi.org')
        .get('/pypi/conan/json')
        .reply(200, { info: { version: '2.9.2' }, releases: {} });
      const { svc } = await toolContext(ConanVersionResolver);

      expect(await svc.resolve('latest')).toBe('2.9.2');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(ConanVersionResolver);

      expect(await svc.resolve('2.9.2')).toBe('2.9.2');
    });
  });
});
