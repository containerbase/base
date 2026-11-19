import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { resolveVersion } from '../../install-tool/index.ts';
import {
  CompressionService,
  LinkToolService,
  ToolVersionsService,
} from '../../services/index.ts';
import { fileContent, getDistro, logger } from '../../utils/index.ts';
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
const tarball = 'git archive';

describe('cli/tools/git/index', () => {
  beforeAll(async () => {
    // the apt config ships with the image
    await ensurePaths(['tmp', 'opt/containerbase/bin', 'etc/apt/apt.conf.d']);
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
    // no tool-versions data, the prebuild is downloaded from its release
    vi.spyOn(
      ToolVersionsService.prototype,
      'getVersionFiles',
    ).mockResolvedValue(undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('GitPrepareService', () => {
    test.each([{ code: 'noble' }, { code: 'resolute' }])(
      'installs the runtime packages on $code',
      async ({ code }) => {
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
            'libcurl3t64-gnutls',
          ],
          { env: { DEBIAN_FRONTEND: 'noninteractive' } },
        );
      },
    );

    test('throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'jammy',
        versionId: '22.04',
      });
      const { svc } = await toolContext(GitPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        "Tool 'git' not supported on: jammy!",
      );
    });
  });

  describe('GitInstallService', () => {
    test.each<{
      cpu: NodeJS.Architecture;
      ghArch: string;
      code: string;
      version: string;
    }>([
      { cpu: 'x64', ghArch: 'x86_64', code: 'noble', version: '2.56.0' },
      { cpu: 'arm64', ghArch: 'aarch64', code: 'noble', version: '2.56.0' },
      // another version, so the download isn't cached yet
      { cpu: 'x64', ghArch: 'x86_64', code: 'resolute', version: '2.55.0' },
    ])(
      'installs the noble prebuild for $ghArch on $code',
      async ({ cpu, ghArch, code, version }) => {
        vi.mocked(arch).mockReturnValue(cpu);
        vi.mocked(getDistro).mockResolvedValue({
          name: 'Ubuntu',
          versionCode: code,
          versionId: '24.04',
        });
        const releaseUrl = `/containerbase/git-prebuild/releases/download/${version}`;
        const filename = `git-${version}-noble-${ghArch}.tar.xz`;
        scope(baseUrl)
          .get(`${releaseUrl}/${filename}.sha512`)
          .reply(200, `${checksum(tarball, 'sha512')}\n`)
          .get(`${releaseUrl}/${filename}`)
          .reply(200, tarball);
        const spy = vi.spyOn(CompressionService.prototype, 'extract');
        const { svc, pathSvc } = await toolContext(GitInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(spy).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(filename),
          cwd: pathSvc.toolPath('git'),
        });
        // the prepare step installs the apt packages
        expect(execaMock).not.toHaveBeenCalledWith(
          'apt-get',
          expect.anything(),
          expect.anything(),
        );
      },
    );

    test.each([
      { version: '2.48.0', valid: true },
      { version: '2.56.0', valid: true },
      { version: 'foo', valid: false },
    ])('validates $version: $valid', async ({ version, valid }) => {
      const { svc } = await toolContext(GitInstallService);

      expect(await svc.validate(version)).toBe(valid);
    });

    test('links the git binaries with shims and per-version wrappers', async () => {
      const { child, svc, pathSvc } = await toolContext(GitInstallService);
      const dir = pathSvc.versionedToolPath('git', '2.56.0');
      (await child.getAsync(LinkToolService)).setContext({
        tool: 'git',
        version: '2.56.0',
        dir,
      });
      const binaries = [
        'git',
        'git-receive-pack',
        'git-shell',
        'git-upload-archive',
        'git-upload-pack',
        'scalar',
      ];

      await expect(svc.link('2.56.0')).resolves.toBeUndefined();

      for (const name of binaries) {
        // the wrapper execs the binary by its path in the version folder, so a
        // signal reaches git, which keeps the name it was called with
        expect(
          await fs.readFile(join(dir, '.wrappers', name), 'utf8'),
        ).toContain(`\nexec -a "$0" ${dir}/bin/${name} "$@"\n`);
        expect(await fs.readFile(join(pathSvc.binDir, name), 'utf8')).toContain(
          `ensure ${name} `,
        );
      }
    });

    test('allows all safe directories and provides git to apt', async () => {
      const { svc, pathSvc } = await toolContext(GitInstallService);
      let root = '';
      let control = '';
      let modes: number[] = [];
      execaMock.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === 'dpkg-deb') {
          root = args[2]!;
          control = await fs.readFile(join(root, 'DEBIAN/control'), 'utf8');
          modes = [
            (await fs.stat(root)).mode & 0o777,
            (await fs.stat(join(root, 'DEBIAN'))).mode & 0o777,
          ];
        }
        return { failed: false };
      });

      await expect(svc.postInstall('2.56.0')).resolves.toBeUndefined();

      // by its path, the command has no pointer yet
      expect(execaMock).toHaveBeenCalledWith(
        join(pathSvc.versionedToolPath('git', '2.56.0'), 'bin/git'),
        ['config', '--system', 'safe.directory', '*'],
        expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
      );
      expect(control).toBe(fileContent`
        Package: containerbase-git
        Version: 2.56.0
        Architecture: all
        Maintainer: containerbase <https://github.com/containerbase/base>
        Provides: git (= 1:2.56.0)
        Description: git installed by containerbase
         Provides the git package for the git containerbase installed.
      `);
      expect(modes).toEqual([0o755, 0o755]);
      expect(execaMock).toHaveBeenCalledWith(
        'dpkg-deb',
        ['--build', '--root-owner-group', root, `${root}.deb`],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'dpkg',
        ['--install', `${root}.deb`],
        expect.any(Object),
      );
      // the build folder is removed again
      await expect(fs.stat(root)).rejects.toThrow();
      // maintainer scripts find the installed git
      expect(
        await fs.readFile(
          rootPath('etc/apt/apt.conf.d/containerbase-git'),
          'utf8',
        ),
      ).toBe('DPkg::Path "/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bin";\n');
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
      expect(svc.restoreNeedsRoot).toBe(false);
      expect(svc.canUninstall).toBe(false);
      expect(svc.minVersion).toBe('2.48.0');
    });

    test('a restore keeps the system wide files of the image', async () => {
      const { child, svc, pathSvc } = await toolContext(GitInstallService);
      const link = await child.getAsync(LinkToolService);
      link.setContext({
        tool: 'git',
        version: '2.56.0',
        dir: pathSvc.versionedToolPath('git', '2.56.0'),
        restore: true,
      });

      const write = vi.spyOn(fs, 'writeFile');

      await expect(svc.postInstall('2.56.0')).resolves.toBeUndefined();

      // no `git config --system`, deb or apt files
      expect(execaMock).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
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
