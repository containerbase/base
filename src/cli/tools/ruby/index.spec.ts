import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';
import { RubyInstallService, RubyPrepareService } from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
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

const githubUrl = 'https://github.com';
const archive = 'ruby archive';

/** The prebuild download path for `version`, `codename` and `ghArch`. */
function prebuildPath(
  version: string,
  codename: string,
  ghArch: string,
): string {
  return `/containerbase/ruby-prebuild/releases/download/${version}/ruby-${version}-${codename}-${ghArch}.tar.xz`;
}

describe('cli/tools/ruby/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp/containerbase/cache',
      'home/ubuntu',
      'opt/containerbase/bin',
      'usr/local',
    ]);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'jammy',
      versionId: '22.04',
    });
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('RubyPrepareService', () => {
    test.each(['jammy', 'noble', 'resolute'])('prepare on %s', async (code) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '24.04',
      });
      const { svc, child, pathSvc } = await toolContext(RubyPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        expect.arrayContaining(['g++', 'libffi-dev', 'libyaml-0-2', 'make']),
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
      for (const entry of ['.gemrc', '.gem', '.cocoapods', 'Library']) {
        expect(await fs.readlink(join(envSvc.userHome, entry))).toBe(
          join(pathSvc.cachePath, entry),
        );
      }
      expect(await fs.readlink(join(envSvc.rootDir, 'usr/local/ruby'))).toBe(
        pathSvc.toolPath('ruby'),
      );
    });

    test('prepare: throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(RubyPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        "Tool 'ruby' not supported on: focal!",
      );
    });

    test('initialize creates the gemrc and folders', async () => {
      const { svc, pathSvc } = await toolContext(RubyPrepareService);
      const gemrc = join(pathSvc.cachePath, '.gemrc');
      await fs.rm(gemrc, { force: true });

      await expect(svc.initialize()).resolves.toBeUndefined();

      expect(await fs.readFile(gemrc, 'utf8')).toBe('gem: --no-document\n');
      expect((await fs.stat(gemrc)).mode & 0o777).toBe(0o664);
      for (const dir of ['.gem', '.cocoapods', 'Library']) {
        const stats = await fs.stat(join(pathSvc.cachePath, dir));
        expect(stats.isDirectory()).toBe(true);
        expect(stats.mode & 0o777).toBe(0o775);
      }
    });

    test('initialize keeps an existing gemrc', async () => {
      const { svc, pathSvc } = await toolContext(RubyPrepareService);
      const gemrc = join(pathSvc.cachePath, '.gemrc');
      await fs.writeFile(gemrc, '# existing\n');

      await expect(svc.initialize()).resolves.toBeUndefined();

      expect(await fs.readFile(gemrc, 'utf8')).toBe('# existing\n');
    });
  });

  describe('RubyInstallService', () => {
    test.each([
      { hostArch: 'x64', ghArch: 'x86_64', version: '3.4.11' },
      { hostArch: 'arm64', ghArch: 'aarch64', version: '4.0.7' },
    ] as const)(
      'install $version on $ghArch with checksum',
      async ({ hostArch, ghArch, version }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc, pathSvc } = await toolContext(RubyInstallService);
        const path = prebuildPath(version, 'jammy', ghArch);
        scope(githubUrl)
          .head(`${path}.sha512`)
          .reply(200)
          .get(`${path}.sha512`)
          .reply(200, `${checksum(archive, 'sha512')}\n`)
          .get(path)
          .reply(200, archive);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(
            `ruby-${version}-jammy-${ghArch}.tar.xz`,
          ),
          cwd: pathSvc.toolPath('ruby'),
        });
        expect(
          await fs.readFile(
            join(pathSvc.versionedToolPath('ruby', version), 'etc/gemrc'),
            'utf8',
          ),
        ).toBe(
          `${codeBlock`
            gem: --no-document
            :benchmark: false
            :verbose: true
            :update_sources: true
            :backtrace: false
          `}\n`,
        );
      },
    );

    test('install without checksum', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'noble',
        versionId: '24.04',
      });
      const version = '2.7.6';
      const { svc, pathSvc } = await toolContext(RubyInstallService);
      const path = prebuildPath(version, 'jammy', 'x86_64');
      scope(githubUrl)
        .head(`${path}.sha512`)
        .reply(404)
        .get(path)
        .reply(200, archive);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(`ruby-${version}-jammy-x86_64.tar.xz`),
        cwd: pathSvc.toolPath('ruby'),
      });
      expect(
        await fs.readFile(
          join(pathSvc.versionedToolPath('ruby', version), 'etc/gemrc'),
          'utf8',
        ),
      ).toContain(':backtrace: false');
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(RubyInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const src = join(pathSvc.versionedToolPath('ruby', '3.4.11'), 'bin');

      await expect(svc.link('3.4.11')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('ruby', { srcDir: src });
      expect(spy).toHaveBeenCalledWith('ruby', { srcDir: src, name: 'gem' });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(RubyInstallService);

      await expect(svc.test('3.4.11')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'ruby',
        ['--version'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'gem',
        ['--version'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'gem',
        ['env'],
        expect.any(Object),
      );
    });
  });
});
