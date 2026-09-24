import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';
import {
  PowershellInstallService,
  PowershellPrepareService,
} from './powershell.ts';
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
const releaseUrl = '/PowerShell/PowerShell/releases/download';
const archive = 'powershell archive';
const bom = String.fromCharCode(0xfeff);

describe('cli/tools/dotnet/powershell', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('PowershellPrepareService', () => {
    test.each([
      { code: 'jammy', pkgs: ['libicu70', 'libssl3'] },
      { code: 'noble', pkgs: ['libicu74', 'libssl3t64'] },
      { code: 'resolute', pkgs: ['libbrotli1', 'libicu78', 'libssl3t64'] },
    ])('prepare on $code', async ({ code, pkgs }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '24.04',
      });
      const { svc } = await toolContext(PowershellPrepareService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        expect.arrayContaining(['libc6', 'zlib1g', ...pkgs]),
      );
    });

    test('prepare: throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(PowershellPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        "Tool 'powershell' not supported on: focal!",
      );
    });
  });

  describe('PowershellInstallService', () => {
    test.each([
      {
        hostArch: 'x64',
        toolArch: 'x64',
        version: '7.6.6',
        encoding: 'utf16le',
      },
      {
        hostArch: 'arm64',
        toolArch: 'arm64',
        version: '7.2.8',
        encoding: 'utf8',
      },
    ] as const)(
      'install $version on $toolArch',
      async ({ hostArch, toolArch, version, encoding }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc, pathSvc } = await toolContext(PowershellInstallService);
        const filename = `powershell-${version}-linux-${toolArch}.tar.gz`;
        const hashes = `${bom}${checksum('other')} *powershell-${version}-osx-${toolArch}.tar.gz\r\n${checksum(archive)} *${filename}\r\n`;
        scope(baseUrl)
          .get(`${releaseUrl}/v${version}/hashes.sha256`)
          .reply(200, Buffer.from(hashes, encoding))
          .get(`${releaseUrl}/v${version}/${filename}`)
          .reply(200, archive);
        const path = pathSvc.versionedToolPath('powershell', version);
        const extract = vi
          .spyOn(CompressionService.prototype, 'extract')
          .mockImplementationOnce(({ cwd }) =>
            fs.writeFile(join(cwd, 'pwsh'), 'pwsh', { mode: 0o644 }),
          );

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(filename),
          cwd: path,
        });
        expect((await fs.stat(join(path, 'pwsh'))).mode & 0o777).toBe(0o775);
      },
    );

    test('install: rejects a missing checksum', async () => {
      const { svc } = await toolContext(PowershellInstallService);
      scope(baseUrl)
        .get(`${releaseUrl}/v7.6.4/hashes.sha256`)
        .reply(
          200,
          `${checksum('other')} *powershell-7.6.4-linux-arm64.tar.gz\n`,
        );

      await expect(svc.install('7.6.4')).rejects.toThrow(
        `Checksum not found in ${baseUrl}${releaseUrl}/v7.6.4/hashes.sha256 for powershell-7.6.4-linux-x64.tar.gz`,
      );
    });

    test('install: rejects a checksum mismatch', async () => {
      const { svc } = await toolContext(PowershellInstallService);
      const filename = 'powershell-7.6.5-linux-x64.tar.gz';
      scope(baseUrl)
        .get(`${releaseUrl}/v7.6.5/hashes.sha256`)
        .reply(200, `${checksum('other')} *${filename}\n`)
        .get(`${releaseUrl}/v7.6.5/${filename}`)
        .times(3)
        .reply(200, archive);

      await expect(svc.install('7.6.5')).rejects.toThrow('download failed');
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(PowershellInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('7.6.6')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('powershell', {
        name: 'pwsh',
        srcDir: pathSvc.versionedToolPath('powershell', '7.6.6'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(PowershellInstallService);

      await expect(svc.test('7.6.6')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'pwsh',
        ['-version'],
        expect.any(Object),
      );
    });
  });
});
