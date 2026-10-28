import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { GhcInstallService, GhcPrepareService } from './ghc.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://downloads.haskell.org';
const tarball = 'ghc archive';

describe('cli/tools/haskell/ghc', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the archive is verified against the release list
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'x86_64', version: '9.8.2' },
    { hostArch: 'arm64', toolArch: 'aarch64', version: '9.8.3' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(GhcInstallService);
      const filename = `ghc-${version}-${toolArch}-deb10-linux.tar.xz`;
      scope(baseUrl)
        .get(`/~ghc/${version}/SHA256SUMS`)
        .reply(200, `${checksum(tarball)} ${filename}\n`)
        .get(`/~ghc/${version}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: pathSvc.versionedToolPath('ghc', version),
        strip: 1,
      });
    },
  );

  test('install: downloads the tool-versions file without the list', async () => {
    const filename = 'ghc-9.8.4-x86_64-deb10-linux.tar.xz';
    mockToolFiles([
      toolFile(
        `${baseUrl}/~ghc/9.8.4/ghc-9.8.4-aarch64-deb10-linux.tar.xz`,
        'arm',
        'arm64',
      ),
      toolFile(`${baseUrl}/~ghc/9.8.4/${filename}`, tarball, 'amd64'),
    ]);
    // there is no interceptor for the `SHA256SUMS`
    scope(baseUrl).get(`/~ghc/9.8.4/${filename}`).reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc, pathSvc } = await toolContext(GhcInstallService);

    await expect(svc.install('9.8.4')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('ghc', '9.8.4'),
      strip: 1,
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(GhcInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const src = join(pathSvc.versionedToolPath('ghc', '9.8.2'), 'bin');

    await expect(svc.link('9.8.2')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('ghc', { srcDir: src });
    expect(spy).toHaveBeenCalledWith('ghc', { srcDir: src, name: 'ghc-pkg' });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(GhcInstallService);

    await expect(svc.test('9.8.2')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'ghc',
      ['--version'],
      expect.any(Object),
    );
  });

  test('GhcPrepareService', async () => {
    const { svc } = await toolContext(GhcPrepareService);

    expect(svc.toString()).toBe('ghc');
  });
});
