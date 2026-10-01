import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { HelmfileInstallService } from './helmfile.ts';
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
const tarball = 'helmfile archive';

describe('cli/tools/helmfile', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '0.169.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '0.169.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(HelmfileInstallService);
      const filename = `helmfile_${version}_linux_${toolArch}.tar.gz`;
      const releaseUrl = `/helmfile/helmfile/releases/download/v${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/helmfile_${version}_checksums.txt`)
        .reply(200, `${checksum(tarball)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('helmfile', version), 'bin'),
      });
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(HelmfileInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.169.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('helmfile', {
      srcDir: join(pathSvc.versionedToolPath('helmfile', '0.169.0'), 'bin'),
      exports: 'HELMFILE_UPGRADE_NOTICE_DISABLED=1',
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(HelmfileInstallService);

    await expect(svc.test('0.169.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'helmfile',
      ['version'],
      expect.any(Object),
    );
  });
});
