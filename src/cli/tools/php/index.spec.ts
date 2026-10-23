import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { VersionFiles } from '../../../../packages/base/src/tool-versions-types.ts';
import {
  CompressionService,
  LinkToolService,
  ToolVersionsService,
} from '../../services/index.ts';
import { getDistro, logger } from '../../utils/index.ts';
import {
  PhpInstallService,
  PhpPrepareService,
  PhpVersionResolver,
} from './index.ts';
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

const baseUrl = 'https://github.com';
const prebuild = '/containerbase/php-prebuild/releases/download';
const tarball = 'php archive';

describe('cli/tools/php/index', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
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
    // no tool-versions data, the prebuild is downloaded from its release
    vi.spyOn(
      ToolVersionsService.prototype,
      'getVersionFiles',
    ).mockResolvedValue(undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('PhpInstallService', () => {
    test.each([
      { hostArch: 'x64', ghArch: 'x86_64', version: '8.3.13' },
      { hostArch: 'arm64', ghArch: 'aarch64', version: '8.3.14' },
    ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(PhpInstallService);
      const filename = `${version}/php-${version}-jammy-${ghArch}.tar.xz`;
      scope(baseUrl)
        .get(`${prebuild}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${prebuild}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(`php-${version}-jammy-${ghArch}.tar.xz`),
        cwd: pathSvc.toolPath('php'),
      });
    });

    test('install: uses the jammy prebuild on noble', async () => {
      const { svc } = await toolContext(PhpInstallService);
      const filename = '8.3.15/php-8.3.15-jammy-x86_64.tar.xz';
      scope(baseUrl)
        .get(`${prebuild}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${prebuild}/${filename}`)
        .reply(200, tarball);

      await expect(svc.install('8.3.15')).resolves.toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        'Using jammy file for php on noble',
      );
    });

    test('install: uses the resolute prebuild on resolute', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'resolute',
        versionId: '26.04',
      });
      const { svc, pathSvc } = await toolContext(PhpInstallService);
      const filename = '8.3.16/php-8.3.16-resolute-x86_64.tar.xz';
      scope(baseUrl)
        .get(`${prebuild}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${prebuild}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install('8.3.16')).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining('php-8.3.16-resolute-x86_64.tar.xz'),
        cwd: pathSvc.toolPath('php'),
      });
    });

    describe('with tool-versions data', () => {
      /**
       * The files of a php version as tool-versions publishes them, with the
       * jammy and resolute builds for both archs.
       */
      function versionFiles(version: string): VersionFiles {
        return {
          tool: 'php',
          version,
          files: ['jammy', 'resolute'].flatMap((distro) =>
            ['aarch64', 'x86_64'].map((ghArch) => ({
              name: `php-${version}-${distro}-${ghArch}.tar.xz`,
              url: `${baseUrl}${prebuild}/${version}/php-${version}-${distro}-${ghArch}.tar.xz`,
              checksum: `sha512:${checksum(tarball, 'sha512')}`,
              arch: ghArch === 'x86_64' ? 'amd64' : 'arm64',
              distro,
            })),
          ),
        };
      }

      test.each([
        { code: 'noble', versionId: '24.04', file: 'jammy', lookups: 2 },
        { code: 'resolute', versionId: '26.04', file: 'resolute', lookups: 1 },
      ])(
        'install: downloads the $file file on $code without the .sha512',
        async ({ code, versionId, file, lookups }) => {
          vi.mocked(getDistro).mockResolvedValue({
            name: 'Ubuntu',
            versionCode: code,
            versionId,
          });
          const version = `8.4.1-${code}`;
          const files = vi
            .spyOn(ToolVersionsService.prototype, 'getVersionFiles')
            .mockResolvedValue(versionFiles(version));
          // there is no interceptor for the `.sha512`
          scope(baseUrl)
            .get(`${prebuild}/${version}/php-${version}-${file}-x86_64.tar.xz`)
            .reply(200, tarball);
          const extract = vi.spyOn(CompressionService.prototype, 'extract');
          const { svc, pathSvc } = await toolContext(PhpInstallService);

          await expect(svc.install(version)).resolves.toBeUndefined();

          expect(files).toHaveBeenCalledTimes(lookups);
          // only logged when the jammy fallback is used
          const log = `Using jammy file for php on ${code}`;
          expect(
            vi.mocked(logger.debug).mock.calls.some(([msg]) => msg === log),
          ).toBe(lookups === 2);
          expect(files).toHaveBeenCalledWith('php', version);
          expect(extract).toHaveBeenCalledExactlyOnceWith({
            file: expect.stringContaining(
              `php-${version}-${file}-x86_64.tar.xz`,
            ),
            cwd: pathSvc.toolPath('php'),
          });
        },
      );

      test('install: falls back to the release without a file for the host', async () => {
        const version = '8.4.2';
        const data = versionFiles(version);
        vi.spyOn(
          ToolVersionsService.prototype,
          'getVersionFiles',
        ).mockResolvedValue({
          ...data,
          files: data.files.filter((f) => f.arch === 'arm64'),
        });
        const filename = `${version}/php-${version}-jammy-x86_64.tar.xz`;
        scope(baseUrl)
          .get(`${prebuild}/${filename}.sha512`)
          .reply(200, `${checksum(tarball, 'sha512')}\n`)
          .get(`${prebuild}/${filename}`)
          .reply(200, tarball);
        const { svc } = await toolContext(PhpInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();
      });

      test('install: falls back to the jammy release on noble without a file for the arch', async () => {
        vi.mocked(getDistro).mockResolvedValue({
          name: 'Ubuntu',
          versionCode: 'noble',
          versionId: '24.04',
        });
        const version = '8.4.3';
        const data = versionFiles(version);
        const files = vi
          .spyOn(ToolVersionsService.prototype, 'getVersionFiles')
          .mockResolvedValue({
            ...data,
            files: data.files.filter((f) => f.arch === 'arm64'),
          });
        const filename = `${version}/php-${version}-jammy-x86_64.tar.xz`;
        scope(baseUrl)
          .get(`${prebuild}/${filename}.sha512`)
          .reply(200, `${checksum(tarball, 'sha512')}\n`)
          .get(`${prebuild}/${filename}`)
          .reply(200, tarball);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');
        const { svc } = await toolContext(PhpInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(files).toHaveBeenCalledTimes(2);
        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`php-${version}-jammy-x86_64.tar.xz`),
          cwd: expect.any(String),
        });
      });
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(PhpInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('8.3.13')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('php', {
        srcDir: join(pathSvc.versionedToolPath('php', '8.3.13'), 'bin'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(PhpInstallService);

      await expect(svc.test('8.3.13')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'php',
        ['--version'],
        expect.any(Object),
      );
    });
  });

  describe('PhpPrepareService', () => {
    test.each([
      { code: 'noble', id: '24.04', zip: 'libzip4' },
      { code: 'resolute', id: '26.04', zip: 'libzip5' },
    ])('prepare on $code', async ({ code, id, zip }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: id,
      });
      const { svc } = await toolContext(PhpPrepareService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        expect.arrayContaining([zip]),
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
    });

    test('prepare: throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'jammy',
        versionId: '22.04',
      });
      const { svc } = await toolContext(PhpPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        'Unsupported distro version: jammy',
      );
    });
  });

  describe('PhpVersionResolver', () => {
    test('resolves latest', async () => {
      scope(baseUrl)
        .get('/containerbase/php-prebuild/releases/latest/download/version')
        .reply(200, '8.3.13');
      const { svc } = await toolContext(PhpVersionResolver);

      expect(await svc.resolve('latest')).toBe('8.3.13');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(PhpVersionResolver);

      expect(await svc.resolve('8.3.13')).toBe('8.3.13');
    });
  });
});
