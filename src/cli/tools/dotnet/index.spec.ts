import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
  PathService,
} from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';
import { DotnetInstallService, DotnetPrepareService } from './index.ts';
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

const baseUrl = 'https://builds.dotnet.microsoft.com';

describe('cli/tools/dotnet/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'opt/containerbase/bin',
      'opt/containerbase/tools',
    ]);
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
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('DotnetInstallService', () => {
    test.each([
      { hostArch: 'x64', toolArch: 'x64', version: '8.0.100' },
      { hostArch: 'arm64', toolArch: 'arm64', version: '8.0.101' },
    ] as const)(
      'install on $toolArch',
      async ({ hostArch, toolArch, version }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc, pathSvc } = await toolContext(DotnetInstallService);
        scope(baseUrl)
          .get(
            `/dotnet/Sdk/${version}/dotnet-sdk-${version}-linux-${toolArch}.tar.gz`,
          )
          .reply(200, 'dotnet archive');
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`dotnet-sdk-${version}`),
          cwd: pathSvc.toolPath('dotnet'),
          strip: 1,
        });
        const dotnet = join(pathSvc.toolPath('dotnet'), 'dotnet');
        expect(execaMock).toHaveBeenCalledWith(
          dotnet,
          ['new'],
          expect.any(Object),
        );
        expect(execaMock).toHaveBeenCalledWith(
          dotnet,
          ['nuget', 'list', 'source'],
          expect.any(Object),
        );
      },
    );

    test('install: skips the nuget source listing before v3.1', async () => {
      const { svc, pathSvc } = await toolContext(DotnetInstallService);
      scope(baseUrl)
        .get('/dotnet/Sdk/3.0.103/dotnet-sdk-3.0.103-linux-x64.tar.gz')
        .reply(200, 'dotnet archive');

      await expect(svc.install('3.0.103')).resolves.toBeUndefined();

      expect(execaMock).not.toHaveBeenCalledWith(
        join(pathSvc.toolPath('dotnet'), 'dotnet'),
        ['nuget', 'list', 'source'],
        expect.any(Object),
      );
    });

    test('install: fixes the ownership of a generated nuget config', async () => {
      const { svc, child } = await toolContext(DotnetInstallService);
      const envSvc = await child.getAsync(EnvService);
      const nugetDir = join(envSvc.userHome, '.nuget', 'NuGet');
      await fs.mkdir(nugetDir, { recursive: true });
      await fs.writeFile(join(nugetDir, 'NuGet.Config'), '<configuration />');
      const setOwner = vi.spyOn(PathService.prototype, 'setOwner');
      scope(baseUrl)
        .get('/dotnet/Sdk/8.0.102/dotnet-sdk-8.0.102-linux-x64.tar.gz')
        .reply(200, 'dotnet archive');

      await expect(svc.install('8.0.102')).resolves.toBeUndefined();

      expect(setOwner).toHaveBeenCalledWith({
        path: join(nugetDir, 'NuGet.Config'),
      });
    });

    test('install: runs the setup as the user when root', async () => {
      vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);
      const { svc, pathSvc } = await toolContext(DotnetInstallService);
      scope(baseUrl)
        .get('/dotnet/Sdk/8.0.103/dotnet-sdk-8.0.103-linux-x64.tar.gz')
        .reply(200, 'dotnet archive');

      await expect(svc.install('8.0.103')).resolves.toBeUndefined();

      const dotnet = join(pathSvc.toolPath('dotnet'), 'dotnet');
      expect(execaMock).toHaveBeenCalledWith(
        'su',
        ['ubuntu', '-c', `${dotnet} new`],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'su',
        ['ubuntu', '-c', `${dotnet} nuget list source`],
        expect.any(Object),
      );
    });

    test('isInstalled', async () => {
      const { svc, pathSvc } = await toolContext(DotnetInstallService);
      const sdk = join(pathSvc.toolPath('dotnet'), 'sdk', '8.0.100');

      expect(await svc.isInstalled('8.0.100')).toBe(false);

      await fs.mkdir(sdk, { recursive: true });
      await fs.writeFile(join(sdk, '.version'), '8.0.100');
      expect(await svc.isInstalled('8.0.100')).toBe(true);
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(DotnetInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('8.0.100')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('dotnet', {
        srcDir: pathSvc.toolPath('dotnet'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(DotnetInstallService);

      await expect(svc.test('8.0.100')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'dotnet',
        ['--info'],
        expect.any(Object),
      );
    });
  });

  describe('DotnetPrepareService', () => {
    test.each([
      { code: 'jammy', icu: 'libicu70' },
      { code: 'noble', icu: 'libicu74' },
    ])('prepare on $code', async ({ code, icu }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '22.04',
      });
      const { svc, child } = await toolContext(DotnetPrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);
      await fs.rm(join(envSvc.userHome, '.nuget'), {
        force: true,
        recursive: true,
      });

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        [
          '-qq',
          'install',
          '-y',
          'libc6',
          'libgcc1',
          'libgssapi-krb5-2',
          icu,
          'libssl3',
          'libstdc++6',
          'zlib1g',
        ],
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
      expect(await fs.readlink(join(envSvc.userHome, '.nuget'))).toBe(
        join(pathSvc.cachePath, '.nuget'),
      );
      expect(
        await fs.readFile(join(pathSvc.toolPath('dotnet'), 'env.sh'), 'utf8'),
      ).toContain(
        'export DOTNET_CLI_TELEMETRY_OPTOUT=${DOTNET_CLI_TELEMETRY_OPTOUT-1}',
      );
    });

    test('initialize is idempotent', async () => {
      const { svc, child } = await toolContext(DotnetPrepareService);
      const pathSvc = await child.getAsync(PathService);

      await expect(svc.initialize()).resolves.toBeUndefined();
      const env = await fs.readFile(
        join(pathSvc.toolPath('dotnet'), 'env.sh'),
        'utf8',
      );

      await expect(svc.initialize()).resolves.toBeUndefined();
      expect(
        await fs.readFile(join(pathSvc.toolPath('dotnet'), 'env.sh'), 'utf8'),
      ).toBe(env);
    });
  });
});
