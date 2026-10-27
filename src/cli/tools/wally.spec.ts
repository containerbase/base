import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { getDistro, logger } from '../utils/index.ts';
import { WallyInstallService } from './wally.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const baseUrl = 'https://github.com';
const tarball = 'wally archive';

describe('cli/tools/wally', () => {
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
    // no tool-versions data, the prebuild is verified against its checksum file
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '0.3.2' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '0.3.3' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(WallyInstallService);
    const filename = `wally-${version}-jammy-${ghArch}.tar.xz`;
    const releaseUrl = `/containerbase/wally-prebuild/releases/download/${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/${filename}.sha512`)
      .reply(200, `${checksum(tarball, 'sha512')}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.toolPath('wally'),
    });
  });

  test.each([{ code: 'noble' }, { code: 'resolute' }])(
    'install: uses the jammy prebuild on $code',
    async ({ code }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '24.04',
      });
      const version = `0.4.0-${code}`;
      const { svc } = await toolContext(WallyInstallService);
      const filename = `wally-${version}-jammy-x86_64.tar.xz`;
      const releaseUrl = `/containerbase/wally-prebuild/releases/download/${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        `Using jammy file for wally on ${code}`,
      );
    },
  );

  test.each([
    { code: 'jammy', lookups: 1 },
    { code: 'noble', lookups: 2 },
  ])(
    'install: downloads the jammy tool-versions file on $code without the .sha512',
    async ({ code, lookups }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '24.04',
      });
      const version = `0.5.0-${code}`;
      const releaseUrl = `/containerbase/wally-prebuild/releases/download/${version}`;
      const filename = `wally-${version}-jammy-x86_64.tar.xz`;
      // only jammy prebuilds are published
      const files = mockToolFiles(
        (['arm64', 'amd64'] as const).map((toolArch) => ({
          ...toolFile(
            `${baseUrl}${releaseUrl}/wally-${version}-jammy-${toolArch === 'amd64' ? 'x86_64' : 'aarch64'}.tar.xz`,
            toolArch === 'amd64' ? tarball : 'arm',
            toolArch,
          ),
          distro: 'jammy',
        })),
      );
      // there is no interceptor for the `.sha512`
      scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');
      const { svc, pathSvc } = await toolContext(WallyInstallService);

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(files).toHaveBeenCalledTimes(lookups);
      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: pathSvc.toolPath('wally'),
      });
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(WallyInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.3.2')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('wally', {
      srcDir: join(pathSvc.versionedToolPath('wally', '0.3.2'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(WallyInstallService);

    await expect(svc.test('0.3.2')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'wally',
      ['--version'],
      expect.any(Object),
    );
  });
});
