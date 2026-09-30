import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../services/index.ts';
import { GolangInstallService, GolangPrepareService } from './golang.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const githubUrl = 'https://github.com';
const goDevUrl = 'https://go.dev';
const googleUrl = 'https://dl.google.com';
const releasesUrl = `${goDevUrl}/dl/?mode=json&include=all`;
const archive = 'go archive';

/** The prebuild download path for `version` and `ghArch`. */
function prebuildPath(version: string, ghArch: string): string {
  return `/containerbase/golang-prebuild/releases/download/${version}/golang-${version}-${ghArch}.tar.xz`;
}

describe('cli/tools/golang', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('GolangPrepareService', () => {
    test('prepare', async () => {
      const { svc, child, pathSvc } = await toolContext(GolangPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        expect.arrayContaining(['bzr', 'mercurial']),
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
      const goPath = join(pathSvc.cachePath, 'go');
      expect(await fs.readlink(join(envSvc.userHome, 'go'))).toBe(goPath);
      expect((await fs.lstat(join(goPath, 'src'))).isDirectory()).toBe(true);
      expect((await fs.lstat(join(goPath, 'bin'))).isDirectory()).toBe(true);
      expect((await fs.lstat(join(goPath, 'pkg'))).isDirectory()).toBe(true);
    });

    test('prepare keeps an existing go link', async () => {
      const { svc, child, pathSvc } = await toolContext(GolangPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();
      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, 'go'))).toBe(
        join(pathSvc.cachePath, 'go'),
      );
    });
  });

  describe('GolangInstallService', () => {
    test.each([
      { hostArch: 'x64', ghArch: 'x86_64' },
      { hostArch: 'arm64', ghArch: 'aarch64' },
    ] as const)(
      'install $ghArch from the prebuild',
      async ({ hostArch, ghArch }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const version = '1.22.5';
        const { svc, pathSvc } = await toolContext(GolangInstallService);
        const path = prebuildPath(version, ghArch);
        scope(githubUrl)
          .head(`${path}.sha512`)
          .reply(200)
          .get(`${path}.sha512`)
          .reply(200, `${checksum(archive, 'sha512')}  golang.tar.xz\n`)
          .get(path)
          .reply(200, archive);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`golang-${version}-${ghArch}.tar.xz`),
          cwd: pathSvc.toolPath('golang'),
        });
      },
    );

    test('install: falls back to the official build for a >= 1.21 version', async () => {
      const version = '1.21.6';
      const { svc, pathSvc } = await toolContext(GolangInstallService);
      const prebuild = prebuildPath(version, 'x86_64');
      scope(githubUrl).head(`${prebuild}.sha512`).reply(404);
      scope(goDevUrl)
        .get('/dl/')
        .query({ mode: 'json', include: 'all' })
        .reply(200, [
          {
            version: `go${version}`,
            files: [{ os: 'linux', arch: 'amd64', sha256: checksum(archive) }],
          },
        ]);
      scope(googleUrl)
        .get(`/go/go${version}.linux-amd64.tar.gz`)
        .reply(200, archive);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(`go${version}.linux-amd64.tar.gz`),
        cwd: pathSvc.versionedToolPath('golang', version),
        strip: 1,
      });
    });

    test('install: falls back to the official build for a < 1.21 x.y.0 version', async () => {
      const version = '1.17.0';
      const fversion = '1.17';
      const { svc, pathSvc } = await toolContext(GolangInstallService);
      const prebuild = prebuildPath(version, 'x86_64');
      scope(githubUrl).head(`${prebuild}.sha512`).reply(404);
      scope(goDevUrl)
        .get('/dl/')
        .query({ mode: 'json', include: 'all' })
        .reply(200, [
          {
            version: `go${fversion}`,
            files: [{ os: 'linux', arch: 'amd64', sha256: checksum(archive) }],
          },
        ]);
      scope(googleUrl)
        .get(`/go/go${fversion}.linux-amd64.tar.gz`)
        .reply(200, archive);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(`go${fversion}.linux-amd64.tar.gz`),
        cwd: pathSvc.versionedToolPath('golang', version),
        strip: 1,
      });
    });

    test('install: rejects a version with no checksum in the go.dev release list', async () => {
      const version = '1.19.9';
      const { svc } = await toolContext(GolangInstallService);
      const prebuild = prebuildPath(version, 'x86_64');
      scope(githubUrl).head(`${prebuild}.sha512`).reply(404);
      scope(goDevUrl)
        .get('/dl/')
        .query({ mode: 'json', include: 'all' })
        .reply(200, [
          {
            version: `go${version}`,
            files: [{ os: 'darwin', arch: 'amd64', sha256: checksum(archive) }],
          },
        ]);

      await expect(svc.install(version)).rejects.toThrow(
        `Checksum not found in ${releasesUrl} for go${version} linux/amd64`,
      );
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(GolangInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('1.22.5')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('golang', {
        name: 'go',
        srcDir: join(pathSvc.versionedToolPath('golang', '1.22.5'), 'bin'),
        exports: `GOBIN=\${GOBIN-${pathSvc.binDir}}`,
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(GolangInstallService);

      await expect(svc.test('1.22.5')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'go',
        ['version'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith('go', ['env'], expect.any(Object));
    });
  });
});
