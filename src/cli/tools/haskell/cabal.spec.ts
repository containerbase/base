import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { CabalInstallService, CabalPrepareService } from './cabal.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://downloads.haskell.org';
const tarball = 'cabal archive';

describe('cli/tools/haskell/cabal', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'x86_64', version: '3.12.1.0' },
    { hostArch: 'arm64', toolArch: 'aarch64', version: '3.12.1.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(CabalInstallService);
      const filename = `cabal-install-${version}-${toolArch}-linux-deb10.tar.xz`;
      const releaseUrl = `/~cabal/cabal-install-${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/SHA256SUMS`)
        .reply(200, `${checksum(tarball)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('cabal', version), 'bin'),
      });
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(CabalInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('3.12.1.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('cabal', {
      srcDir: join(pathSvc.versionedToolPath('cabal', '3.12.1.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(CabalInstallService);

    await expect(svc.test('3.12.1.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'cabal',
      ['--version'],
      expect.any(Object),
    );
  });

  test('validate requires a four part version', async () => {
    const { svc } = await toolContext(CabalInstallService);

    expect(await svc.validate('3.12.1.0')).toBe(true);
    expect(await svc.validate('3.12.1')).toBe(false);
  });

  test('CabalPrepareService', async () => {
    const { svc } = await toolContext(CabalPrepareService);

    expect(svc.toString()).toBe('cabal');
  });
});
