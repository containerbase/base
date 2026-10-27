import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { HelmInstallService } from './helm.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://get.helm.sh';
const tarball = 'helm archive';

describe('cli/tools/helm', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the archive is verified against its checksum file
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '3.16.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '3.16.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(HelmInstallService);
      const filename = `helm-v${version}-linux-${toolArch}.tar.gz`;
      scope(baseUrl)
        .get(`/${filename}.sha256sum`)
        .reply(200, `${checksum(tarball)}  ${filename}\n`)
        .get(`/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('helm', version), 'bin'),
        strip: 1,
      });
    },
  );

  test('install: downloads the tool-versions file without the .sha256sum', async () => {
    const filename = 'helm-v3.17.0-linux-amd64.tar.gz';
    mockToolFiles([
      toolFile(`${baseUrl}/helm-v3.17.0-linux-arm64.tar.gz`, 'arm', 'arm64'),
      toolFile(`${baseUrl}/${filename}`, tarball, 'amd64'),
    ]);
    // there is no interceptor for the `.sha256sum`
    scope(baseUrl).get(`/${filename}`).reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc } = await toolContext(HelmInstallService);

    await expect(svc.install('3.17.0')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ file: expect.stringContaining(filename) }),
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(HelmInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('3.16.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('helm', {
      srcDir: join(pathSvc.versionedToolPath('helm', '3.16.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(HelmInstallService);

    await expect(svc.test('3.16.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'helm',
      ['version'],
      expect.any(Object),
    );
  });
});
