import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
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
      versionCode: 'jammy',
      versionId: '22.04',
    });
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
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
        .head(`${prebuild}/${filename}.sha512`)
        .reply(200)
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

    test('install: without a checksum', async () => {
      const { svc } = await toolContext(PhpInstallService);
      const filename = '8.2.0/php-8.2.0-jammy-x86_64.tar.xz';
      scope(baseUrl)
        .head(`${prebuild}/${filename}.sha512`)
        .reply(404)
        .get(`${prebuild}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install('8.2.0')).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledOnce();
    });

    test('install: uses the jammy prebuild on noble', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'noble',
        versionId: '24.04',
      });
      const { svc } = await toolContext(PhpInstallService);
      const filename = '8.3.15/php-8.3.15-jammy-x86_64.tar.xz';
      scope(baseUrl)
        .head(`${prebuild}/${filename}.sha512`)
        .reply(404)
        .get(`${prebuild}/${filename}`)
        .reply(200, tarball);

      await expect(svc.install('8.3.15')).resolves.toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        'Using jammy prebuild for php on noble',
      );
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
      { code: 'jammy', zip: 'libzip4' },
      { code: 'noble', zip: 'libzip4' },
      { code: 'resolute', zip: 'libzip5' },
    ])('prepare on $code', async ({ code, zip }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '22.04',
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
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(PhpPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        'Unsupported distro version: focal',
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
