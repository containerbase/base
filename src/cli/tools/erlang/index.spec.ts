import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';
import { ErlangInstallService, ErlangPrepareService } from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

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

const githubUrl = 'https://github.com';
const archive = 'erlang archive';

/** The prebuild download path for `version`, `codename` and `ghArch`. */
function prebuildPath(
  version: string,
  codename: string,
  ghArch: string,
): string {
  return `/containerbase/erlang-prebuild/releases/download/${version}/erlang-${version}-${codename}-${ghArch}.tar.xz`;
}

describe('cli/tools/erlang/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'opt/containerbase/bin',
      'usr/local',
    ]);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'jammy',
      versionId: '22.04',
    });
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('ErlangPrepareService', () => {
    test('prepare', async () => {
      const { svc, child, pathSvc } = await toolContext(ErlangPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.rootDir, 'usr/local/erlang'))).toBe(
        pathSvc.toolPath('erlang'),
      );
    });

    test('prepare keeps an existing erlang link', async () => {
      const { svc, child, pathSvc } = await toolContext(ErlangPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();
      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.rootDir, 'usr/local/erlang'))).toBe(
        pathSvc.toolPath('erlang'),
      );
    });
  });

  describe('ErlangInstallService', () => {
    describe('validate', () => {
      test.each([
        '28.5.0.7',
        '24.3.4.17',
        '26.2.5.0',
        '28.5.0.7+1',
        '28.5.0.7-rc1',
      ])('accepts %s', async (version) => {
        const { svc } = await toolContext(ErlangInstallService);

        await expect(svc.validate(version)).resolves.toBe(true);
      });

      test.each(['26.2.5', '26', 'foo', '26.2.5.'])(
        'rejects %s',
        async (version) => {
          const { svc } = await toolContext(ErlangInstallService);

          await expect(svc.validate(version)).resolves.toBe(false);
        },
      );
    });

    test.each([
      { code: 'jammy', version: '25.3.0.1' },
      { code: 'noble', version: '25.3.0.2' },
      { code: 'resolute', version: '25.3.0.3' },
    ])(
      'install on $code uses the jammy prebuild',
      async ({ code, version }) => {
        vi.mocked(getDistro).mockResolvedValue({
          name: 'Ubuntu',
          versionCode: code,
          versionId: '24.04',
        });
        const { svc, pathSvc } = await toolContext(ErlangInstallService);
        const path = prebuildPath(version, 'jammy', 'x86_64');
        scope(githubUrl)
          .get(`${path}.sha512`)
          .reply(200, `${checksum(archive, 'sha512')}  erlang.tar.xz\n`)
          .get(path)
          .reply(200, archive);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(
            `erlang-${version}-jammy-x86_64.tar.xz`,
          ),
          cwd: pathSvc.toolPath('erlang'),
        });
      },
    );

    test.each([
      { hostArch: 'x64', ghArch: 'x86_64' },
      { hostArch: 'arm64', ghArch: 'aarch64' },
    ] as const)(
      'install $ghArch from the prebuild',
      async ({ hostArch, ghArch }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const version = '25.3.1.0';
        const { svc, pathSvc } = await toolContext(ErlangInstallService);
        const path = prebuildPath(version, 'jammy', ghArch);
        scope(githubUrl)
          .get(`${path}.sha512`)
          .reply(200, `${checksum(archive, 'sha512')}  erlang.tar.xz\n`)
          .get(path)
          .reply(200, archive);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(
            `erlang-${version}-jammy-${ghArch}.tar.xz`,
          ),
          cwd: pathSvc.toolPath('erlang'),
        });
      },
    );

    test('install: skips the checksum for a version below 25.3.0.0', async () => {
      const version = '24.3.4.17';
      const { svc, pathSvc } = await toolContext(ErlangInstallService);
      const path = prebuildPath(version, 'jammy', 'x86_64');
      scope(githubUrl).get(path).reply(200, archive);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(`erlang-${version}-jammy-x86_64.tar.xz`),
        cwd: pathSvc.toolPath('erlang'),
      });
    });

    test('install: throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(ErlangInstallService);

      await expect(svc.install('25.3.0.0')).rejects.toThrow(
        "Tool 'erlang' not supported on: focal!",
      );
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(ErlangInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('25.3.0.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('erlang', {
        name: 'erl',
        srcDir: join(pathSvc.versionedToolPath('erlang', '25.3.0.0'), 'bin'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(ErlangInstallService);

      await expect(svc.test('25.3.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'erl',
        [
          '-eval',
          'erlang:display(erlang:system_info(otp_release)), halt().',
          '-noshell',
        ],
        expect.any(Object),
      );
    });
  });
});
