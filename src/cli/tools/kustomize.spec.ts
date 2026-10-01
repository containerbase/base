import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { KustomizeInstallService } from './kustomize.ts';
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
const tarball = 'kustomize archive';

describe('cli/tools/kustomize', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '5.4.3' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '5.4.4' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(KustomizeInstallService);
      const filename = `kustomize_v${version}_linux_${toolArch}.tar.gz`;
      const releaseUrl = `/kubernetes-sigs/kustomize/releases/download/kustomize%2Fv${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/checksums.txt`)
        .reply(200, `${checksum(tarball)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('kustomize', version), 'bin'),
      });
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(KustomizeInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('5.4.3')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('kustomize', {
      srcDir: join(pathSvc.versionedToolPath('kustomize', '5.4.3'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(KustomizeInstallService);

    await expect(svc.test('5.4.3')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'kustomize',
      ['version'],
      expect.any(Object),
    );
  });
});
