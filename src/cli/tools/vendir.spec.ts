import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../services/index.ts';
import { VendirInstallService } from './vendir.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';
const releaseUrl = '/vmware-tanzu/carvel-vendir/releases/download';
const binary = 'vendir binary';

describe('cli/tools/vendir', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '0.46.1' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '0.46.2' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(VendirInstallService);
      const filename = `vendir-linux-${toolArch}`;
      scope(baseUrl)
        .get(`${releaseUrl}/v${version}/checksums.txt`)
        .reply(
          200,
          `${checksum('other')}  vendir-darwin-${toolArch}\n${checksum(binary)}  ${filename}\n`,
        )
        .get(`${releaseUrl}/v${version}/${filename}`)
        .reply(200, binary);

      await expect(svc.install(version)).resolves.toBeUndefined();

      const file = join(
        pathSvc.versionedToolPath('vendir', version),
        'bin',
        'vendir',
      );
      expect(await fs.readFile(file, 'utf8')).toBe(binary);
      expect((await fs.stat(file)).mode & 0o777).toBe(0o775);
    },
  );

  test('install: skips the checksum before it was published', async () => {
    const { svc, pathSvc } = await toolContext(VendirInstallService);
    scope(baseUrl)
      .get(`${releaseUrl}/v0.24.0/vendir-linux-amd64`)
      .reply(200, binary);

    await expect(svc.install('0.24.0')).resolves.toBeUndefined();

    expect(
      await fs.readFile(
        join(pathSvc.versionedToolPath('vendir', '0.24.0'), 'bin', 'vendir'),
        'utf8',
      ),
    ).toBe(binary);
  });

  test('install: rejects a missing checksum', async () => {
    const { svc } = await toolContext(VendirInstallService);
    scope(baseUrl)
      .get(`${releaseUrl}/v0.26.0/checksums.txt`)
      .reply(200, `${checksum('other')}  vendir-darwin-amd64\n`);

    await expect(svc.install('0.26.0')).rejects.toThrow(
      `Checksum not found in ${baseUrl}${releaseUrl}/v0.26.0/checksums.txt for vendir-linux-amd64`,
    );
  });

  test('install: rejects a checksum mismatch', async () => {
    const { svc } = await toolContext(VendirInstallService);
    scope(baseUrl)
      .get(`${releaseUrl}/v0.25.0/checksums.txt`)
      .reply(200, `${checksum('other')}  vendir-linux-amd64\n`)
      .get(`${releaseUrl}/v0.25.0/vendir-linux-amd64`)
      .times(3)
      .reply(200, binary);

    await expect(svc.install('0.25.0')).rejects.toThrow('download failed');
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(VendirInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.46.2')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('vendir', {
      srcDir: join(pathSvc.versionedToolPath('vendir', '0.46.2'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(VendirInstallService);

    await expect(svc.test('0.46.2')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'vendir',
      ['--version'],
      expect.any(Object),
    );
  });
});
