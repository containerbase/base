import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { DevboxInstallService } from './devbox.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';
const tarball = 'devbox archive';

describe('cli/tools/devbox', () => {
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
    { hostArch: 'x64', toolArch: 'amd64', version: '0.13.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '0.13.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(DevboxInstallService);
      const filename = `devbox_${version}_linux_${toolArch}.tar.gz`;
      const releaseUrl = `/jetify-com/devbox/releases/download/${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/checksums.txt`)
        .reply(200, `${checksum(tarball)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('devbox', version), 'bin'),
      });
    },
  );

  test('install: downloads the tool-versions file without the list', async () => {
    const releaseUrl = '/jetify-com/devbox/releases/download/0.14.0';
    const filename = 'devbox_0.14.0_linux_amd64.tar.gz';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/devbox_0.14.0_linux_arm64.tar.gz`,
        'arm',
        'arm64',
      ),
      toolFile(`${baseUrl}${releaseUrl}/${filename}`, tarball, 'amd64'),
    ]);
    // there is no interceptor for the `checksums.txt`
    scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc } = await toolContext(DevboxInstallService);

    await expect(svc.install('0.14.0')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ file: expect.stringContaining(filename) }),
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(DevboxInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.13.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('devbox', {
      srcDir: join(pathSvc.versionedToolPath('devbox', '0.13.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(DevboxInstallService);

    await expect(svc.test('0.13.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'devbox',
      ['version'],
      expect.any(Object),
    );
  });
});
