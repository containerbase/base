import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../services/index.ts';
import { KubectlInstallService } from './kubectl.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://dl.k8s.io';
const binary = 'kubectl binary';

describe('cli/tools/kubectl', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '1.31.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '1.31.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(KubectlInstallService);
      const releaseUrl = `/release/v${version}/bin/linux/${toolArch}`;
      scope(baseUrl)
        .get(`${releaseUrl}/kubectl.sha256`)
        .reply(200, checksum(binary))
        .get(`${releaseUrl}/kubectl`)
        .reply(200, binary);

      await expect(svc.install(version)).resolves.toBeUndefined();

      const file = join(
        pathSvc.versionedToolPath('kubectl', version),
        'bin',
        'kubectl',
      );
      expect(await fs.readFile(file, 'utf8')).toBe(binary);
      expect((await fs.stat(file)).mode & 0o777).toBe(0o775);
    },
  );

  test('install: rejects an empty checksum', async () => {
    const { svc } = await toolContext(KubectlInstallService);
    scope(baseUrl)
      .get('/release/v1.30.0/bin/linux/amd64/kubectl.sha256')
      .reply(200, '\n');

    await expect(svc.install('1.30.0')).rejects.toThrow(
      'Checksum for kubectl not found',
    );
  });

  test('install: rejects a checksum mismatch', async () => {
    const { svc } = await toolContext(KubectlInstallService);
    scope(baseUrl)
      .get('/release/v1.29.0/bin/linux/amd64/kubectl.sha256')
      .reply(200, checksum('other'))
      .get('/release/v1.29.0/bin/linux/amd64/kubectl')
      .times(3)
      .reply(200, binary);

    await expect(svc.install('1.29.0')).rejects.toThrow('download failed');
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(KubectlInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.31.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('kubectl', {
      srcDir: join(pathSvc.versionedToolPath('kubectl', '1.31.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(KubectlInstallService);

    await expect(svc.test('1.31.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'kubectl',
      ['version', '--client'],
      expect.any(Object),
    );
  });
});
