import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { TofuInstallService } from './tofu.ts';
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
const tarball = 'tofu archive';

describe('cli/tools/tofu', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '1.10.6' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '1.10.7' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(TofuInstallService);
      const filename = `tofu_${version}_linux_${toolArch}.tar.gz`;
      const releaseUrl = `/opentofu/opentofu/releases/download/v${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/tofu_${version}_SHA256SUMS`)
        .reply(200, `${checksum(tarball)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('tofu', version), 'bin'),
      });
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(TofuInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.10.6')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('tofu', {
      srcDir: join(pathSvc.versionedToolPath('tofu', '1.10.6'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(TofuInstallService);

    await expect(svc.test('1.10.6')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'tofu',
      ['--version'],
      expect.any(Object),
    );
  });
});
