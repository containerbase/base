import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../../services/index.ts';
import { GitLfsInstallService } from './lfs.ts';
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
const releaseUrl = '/git-lfs/git-lfs/releases/download';
const archive = 'git-lfs archive';
const binary = 'git-lfs binary';

describe('cli/tools/git/lfs', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '3.8.0', strip: 1 },
    { hostArch: 'arm64', toolArch: 'arm64', version: '3.1.4', strip: 0 },
  ] as const)(
    'install $version on $toolArch',
    async ({ hostArch, toolArch, version, strip }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(GitLfsInstallService);
      const filename = `git-lfs-linux-${toolArch}-v${version}.tar.gz`;
      scope(baseUrl)
        .get(`${releaseUrl}/v${version}/sha256sums.asc`)
        .reply(
          200,
          `-----BEGIN PGP SIGNED MESSAGE-----\n${checksum('other')}  git-lfs-darwin-${toolArch}-v${version}.zip\n${checksum(archive)}  ${filename}\n`,
        )
        .get(`${releaseUrl}/v${version}/${filename}`)
        .reply(200, archive);
      const extract = vi
        .spyOn(CompressionService.prototype, 'extract')
        .mockImplementationOnce(({ cwd }) =>
          fs.writeFile(join(cwd, 'git-lfs'), binary),
        );

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: expect.any(String),
        strip,
      });
      expect(
        await fs.readFile(
          join(pathSvc.versionedToolPath('git-lfs', version), 'bin', 'git-lfs'),
          'utf8',
        ),
      ).toBe(binary);
    },
  );

  test('install: rejects a missing checksum', async () => {
    const { svc } = await toolContext(GitLfsInstallService);
    scope(baseUrl)
      .get(`${releaseUrl}/v3.6.0/sha256sums.asc`)
      .reply(200, `${checksum('other')}  git-lfs-linux-arm64-v3.6.0.tar.gz\n`);

    await expect(svc.install('3.6.0')).rejects.toThrow(
      'Checksum for git-lfs-linux-amd64-v3.6.0.tar.gz not found',
    );
  });

  test('install: rejects a checksum mismatch', async () => {
    const { svc } = await toolContext(GitLfsInstallService);
    const filename = 'git-lfs-linux-amd64-v3.7.0.tar.gz';
    scope(baseUrl)
      .get(`${releaseUrl}/v3.7.0/sha256sums.asc`)
      .reply(200, `${checksum('other')}  ${filename}\n`)
      .get(`${releaseUrl}/v3.7.0/${filename}`)
      .times(3)
      .reply(200, archive);

    await expect(svc.install('3.7.0')).rejects.toThrow('download failed');
  });

  test.each([
    { root: true, args: ['lfs', 'install', '--system'] },
    { root: false, args: ['lfs', 'install'] },
  ])('link as root=$root', async ({ root, args }) => {
    vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(root);
    const { svc, pathSvc } = await toolContext(GitLfsInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('3.8.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('git-lfs', {
      srcDir: join(pathSvc.versionedToolPath('git-lfs', '3.8.0'), 'bin'),
    });
    expect(execaMock).toHaveBeenCalledWith('git', args, expect.any(Object));
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(GitLfsInstallService);

    await expect(svc.test('3.8.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['lfs', 'version'],
      expect.any(Object),
    );
  });
});
