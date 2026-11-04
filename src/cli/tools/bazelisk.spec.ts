import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpService, LinkToolService } from '../services/index.ts';
import { BazeliskInstallService } from './bazelisk.ts';
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

describe('cli/tools/bazelisk', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the binary is downloaded unverified
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '1.20.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '1.20.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(BazeliskInstallService);
      scope(baseUrl)
        .get(
          `/bazelbuild/bazelisk/releases/download/v${version}/bazelisk-linux-${toolArch}`,
        )
        .reply(200, 'bazelisk binary');

      await expect(svc.install(version)).resolves.toBeUndefined();

      const bin = join(pathSvc.versionedToolPath('bazelisk', version), 'bin');
      expect(await fs.readFile(join(bin, 'bazelisk'), 'utf8')).toBe(
        'bazelisk binary',
      );
      expect(await fs.readlink(join(bin, 'bazel'))).toBe(join(bin, 'bazelisk'));
    },
  );

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '1.21.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '1.21.2' },
  ] as const)(
    'install: verifies the $toolArch tool-versions file',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const releaseUrl = `/bazelbuild/bazelisk/releases/download/v${version}`;
      mockToolFiles(
        (['amd64', 'arm64'] as const).map((a) =>
          toolFile(
            `${baseUrl}${releaseUrl}/bazelisk-linux-${a}`,
            `bazelisk ${a}`,
            a,
          ),
        ),
      );
      scope(baseUrl)
        .get(`${releaseUrl}/bazelisk-linux-${toolArch}`)
        .reply(200, `bazelisk ${toolArch}`);
      const download = vi.spyOn(HttpService.prototype, 'download');
      const { svc, pathSvc } = await toolContext(BazeliskInstallService);

      await expect(svc.install(version)).resolves.toBeUndefined();

      // verified against the checksum of the data file of the arch
      expect(download).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedChecksum: checksum(`bazelisk ${toolArch}`),
        }),
      );
      const bin = join(pathSvc.versionedToolPath('bazelisk', version), 'bin');
      expect(await fs.readFile(join(bin, 'bazelisk'), 'utf8')).toBe(
        `bazelisk ${toolArch}`,
      );
    },
  );

  test('install: rejects a tool-versions checksum mismatch', async () => {
    const releaseUrl = '/bazelbuild/bazelisk/releases/download/v1.21.1';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/bazelisk-linux-amd64`,
        'other',
        'amd64',
      ),
    ]);
    scope(baseUrl)
      .get(`${releaseUrl}/bazelisk-linux-amd64`)
      .times(3)
      .reply(200, 'bazelisk binary');
    const { svc } = await toolContext(BazeliskInstallService);

    await expect(svc.install('1.21.1')).rejects.toThrow('download failed');
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(BazeliskInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const src = join(pathSvc.versionedToolPath('bazelisk', '1.20.0'), 'bin');

    await expect(svc.link('1.20.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('bazelisk', { srcDir: src });
    expect(spy).toHaveBeenCalledWith('bazelisk', {
      name: 'bazel',
      srcDir: src,
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(BazeliskInstallService);

    await expect(svc.test('1.20.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'bazelisk',
      ['version'],
      expect.any(Object),
    );
  });
});
