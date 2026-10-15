import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { resolveVersion } from '../../install-tool/index.ts';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { getDistro, logger } from '../../utils/index.ts';
import {
  GitInstallService,
  GitPrepareService,
  GitVersionResolver,
} from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths, rootPath } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const baseUrl = 'https://github.com';
const releaseUrl = '/containerbase/git-prebuild/releases/download/2.56.0';
const tarball = 'git archive';

describe('cli/tools/git/index', () => {
  beforeAll(async () => {
    // `usr/bin` and `usr/local/bin` ship with the image
    await ensurePaths([
      'tmp',
      'opt/containerbase/bin',
      'usr/bin',
      'usr/local/bin',
    ]);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('GitPrepareService', () => {
    test.each([
      { code: 'jammy', pkgs: ['libcurl4', 'libssl3', 'libcurl3-gnutls'] },
      {
        code: 'noble',
        pkgs: ['libcurl4t64', 'libssl3t64', 'libcurl3t64-gnutls'],
      },
      {
        code: 'resolute',
        pkgs: ['libcurl4t64', 'libssl3t64', 'libcurl3t64-gnutls'],
      },
    ])('installs the runtime packages on $code', async ({ code, pkgs }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '24.04',
      });
      const { svc } = await toolContext(GitPrepareService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        [
          '-qq',
          'install',
          '-y',
          'ca-certificates',
          'libexpat1',
          'libpcre2-8-0',
          'zlib1g',
          'git-man',
          'liberror-perl',
          'perl',
          ...pkgs,
        ],
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
    });

    test('throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(GitPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        "Tool 'git' not supported on: focal!",
      );
    });
  });

  describe('GitInstallService', () => {
    test.each<{ cpu: NodeJS.Architecture; ghArch: string }>([
      { cpu: 'x64', ghArch: 'x86_64' },
      { cpu: 'arm64', ghArch: 'aarch64' },
    ])('installs the jammy prebuild for $ghArch', async ({ cpu, ghArch }) => {
      vi.mocked(arch).mockReturnValue(cpu);
      const filename = `git-2.56.0-jammy-${ghArch}.tar.xz`;
      scope(baseUrl)
        .get(`${releaseUrl}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const spy = vi.spyOn(CompressionService.prototype, 'extract');
      const { svc, pathSvc } = await toolContext(GitInstallService);

      await expect(svc.install('2.56.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: pathSvc.toolPath('git'),
      });
      // also for images prepared before git came from the prebuild
      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        [
          '-qq',
          'install',
          '-y',
          'ca-certificates',
          'libexpat1',
          'libpcre2-8-0',
          'zlib1g',
          'git-man',
          'liberror-perl',
          'perl',
          'libcurl4t64',
          'libssl3t64',
          'libcurl3t64-gnutls',
        ],
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
    });

    test('install throws on an unsupported distro before downloading', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.install('2.56.0')).rejects.toThrow(
        "Tool 'git' not supported on: focal!",
      );
    });

    test.each([
      { version: '2.48.0', valid: true },
      { version: '2.56.0', valid: true },
      { version: '2.47.3', valid: false },
      { version: 'foo', valid: false },
    ])('validates $version: $valid', async ({ version, valid }) => {
      const { svc } = await toolContext(GitInstallService);

      expect(await svc.validate(version)).toBe(valid);
    });

    test('symlinks the git binaries without a shell wrapper', async () => {
      const wrapper = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const { svc, pathSvc } = await toolContext(GitInstallService);
      const binaries = [
        'git',
        'git-receive-pack',
        'git-shell',
        'git-upload-archive',
        'git-upload-pack',
        'scalar',
      ];

      await expect(svc.link('2.55.0')).resolves.toBeUndefined();
      // a version switch replaces the links
      await expect(svc.link('2.56.0')).resolves.toBeUndefined();

      const bin = join(pathSvc.versionedToolPath('git', '2.56.0'), 'bin');
      for (const name of binaries) {
        expect(await fs.readlink(join(pathSvc.binDir, name))).toBe(
          join(bin, name),
        );
        // compatibility links follow the `/usr/local/bin` ones
        expect(await fs.readlink(rootPath(`usr/bin/${name}`))).toBe(
          rootPath(`usr/local/bin/${name}`),
        );
      }
      expect(wrapper).not.toHaveBeenCalled();
    });

    test('keeps an existing file in /usr/bin', async () => {
      const { svc } = await toolContext(GitInstallService);
      const usrBinGit = rootPath('usr/bin/git');
      await fs.rm(usrBinGit, { force: true });
      await fs.writeFile(usrBinGit, 'ubuntu git');

      await expect(svc.link('2.56.0')).resolves.toBeUndefined();

      expect(await fs.readFile(usrBinGit, 'utf8')).toBe('ubuntu git');
      await fs.rm(usrBinGit);
    });

    test('allows all safe directories', async () => {
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.postInstall('2.56.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'git',
        ['config', '--system', 'safe.directory', '*'],
        expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
      );
    });

    test('prints the version', async () => {
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.test('2.56.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'git',
        ['--version'],
        expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
      );
    });

    test('needs root and cannot be uninstalled', async () => {
      const { svc } = await toolContext(GitInstallService);

      expect(svc.needsRoot).toBe(true);
      expect(svc.canUninstall).toBe(false);
      expect(svc.minVersion).toBe('2.48.0');
    });
  });

  describe('GitVersionResolver', () => {
    test.each([{ version: undefined }, { version: 'latest' }])(
      'resolves $version to the latest prebuild',
      async ({ version }) => {
        scope(baseUrl)
          .get('/containerbase/git-prebuild/releases/latest/download/version')
          .reply(200, '2.56.0');
        const { svc } = await toolContext(GitVersionResolver);

        expect(await svc.resolve(version)).toBe('2.56.0');
      },
    );

    test.each([
      { version: '2.48.0' },
      { version: '2.56.0' },
      // newer than the newest prebuild, fails the download
      { version: '3.0.0' },
    ])('keeps $version without any request', async ({ version }) => {
      const { svc } = await toolContext(GitVersionResolver);

      expect(await svc.resolve(version)).toBe(version);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test.each([
      { version: '2', reason: 'a partial major' },
      { version: '2.40', reason: 'a partial major.minor' },
      { version: '2.47.3', reason: 'before the first prebuild' },
      { version: '2.33.0', reason: 'before the first prebuild' },
      { version: '2.57.0-rc0', reason: 'a prerelease' },
      { version: '2.43.0-1ubuntu1', reason: 'a vendor version' },
      { version: 'foo', reason: 'no version' },
    ])(
      'falls back to the newest prebuild for $version, $reason',
      async ({ version }) => {
        scope(baseUrl)
          .get('/containerbase/git-prebuild/releases/latest/download/version')
          .reply(200, '2.56.0');
        const { svc } = await toolContext(GitVersionResolver);

        expect(await svc.resolve(version)).toBe('2.56.0');
        expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
          `No git ${version} prebuild, installing the newest git 2.56.0 instead`,
        );
      },
    );

    test('does not depend on the distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(GitVersionResolver);

      expect(await svc.resolve('2.56.0')).toBe('2.56.0');
      expect(getDistro).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('install-tool installs the version it resolved', async () => {
      scope(baseUrl)
        .get('/containerbase/git-prebuild/releases/latest/download/version')
        .reply(200, '2.56.0');

      expect(await resolveVersion('git', '2.40.0')).toBe('2.56.0');
    });
  });
});
