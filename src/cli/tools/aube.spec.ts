import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { AubeInstallService } from './aube.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';
const archive = 'aube archive';

describe('cli/tools/aube', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', ghArch: 'x86_64', version: '1.41.0' },
    {
      hostArch: 'arm64',
      toolArch: 'arm64',
      ghArch: 'aarch64',
      version: '1.40.0',
    },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, ghArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const releaseUrl = `/aubepkg/aube/releases/download/v${version}`;
      const filename = `aube-v${version}-${ghArch}-unknown-linux-gnu.tar.gz`;
      mockToolFiles([
        toolFile(
          `${baseUrl}${releaseUrl}/aube-v${version}-${ghArch}-unknown-linux-musl.tar.gz`,
          'musl',
          toolArch,
        ),
        toolFile(`${baseUrl}${releaseUrl}/${filename}`, archive, toolArch),
      ]);
      scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, archive);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');
      const { svc, pathSvc } = await toolContext(AubeInstallService);

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: join(pathSvc.versionedToolPath('aube', version), 'bin'),
      });
    },
  );

  test('install: rejects without a tool-versions file', async () => {
    const { svc } = await toolContext(AubeInstallService);

    await expect(svc.install('1.41.0')).rejects.toThrow(
      'There is no tool-versions file for aube 1.41.0 on this host',
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(AubeInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.41.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('aube', {
      srcDir: join(pathSvc.versionedToolPath('aube', '1.41.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(AubeInstallService);

    await expect(svc.test('1.41.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'aube',
      ['--version'],
      expect.any(Object),
    );
  });
});
