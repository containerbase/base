import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { VersionFiles } from '../../../../packages/base/src/tool-versions-types.ts';
import {
  CompressionService,
  EnvService,
  LinkToolService,
  PathService,
  ToolVersionsService,
} from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import { NodeInstallService, NodePrepareService } from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths, rootPath } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const ghUrl = 'https://github.com';
const nodeUrl = 'https://nodejs.org';
const tarball = 'node archive';
const prebuild = '/containerbase/node-prebuild/releases/download';

describe('cli/tools/node/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'opt/containerbase/bin',
      'opt/containerbase/tools',
    ]);
  });

  beforeEach(() => {
    // the npm install cleans up `$HOME/.npm/_logs`
    vi.stubEnv('HOME', rootPath('home/ubuntu'));
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the release and nodejs.org are checked directly
    vi.spyOn(
      ToolVersionsService.prototype,
      'getVersionFiles',
    ).mockResolvedValue(undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('NodeInstallService', () => {
    test.each([
      { hostArch: 'x64', ghArch: 'x86_64', version: '22.11.0' },
      { hostArch: 'arm64', ghArch: 'aarch64', version: '22.11.1' },
    ] as const)(
      'install from the prebuild on $ghArch',
      async ({ hostArch, ghArch, version }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc, pathSvc } = await toolContext(NodeInstallService);
        const filename = `${version}/node-${version}-${ghArch}.tar.xz`;
        scope(ghUrl)
          .head(`${prebuild}/${filename}.sha512`)
          .reply(200)
          .get(`${prebuild}/${filename}.sha512`)
          .reply(200, `${checksum(tarball, 'sha512')}\n`)
          .get(`${prebuild}/${filename}`)
          .reply(200, tarball);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`node-${version}-${ghArch}.tar.xz`),
          cwd: pathSvc.versionedToolPath('node', version),
          strip: 1,
        });
      },
    );

    test('install: removes the temp folder when node-gyp update fails', async () => {
      const { svc } = await toolContext(NodeInstallService);
      const version = '14.21.9';
      const filename = `${version}/node-${version}-x86_64.tar.xz`;
      const distFile = `node-v${version}-linux-x64.tar.xz`;
      scope(ghUrl).head(`${prebuild}/${filename}.sha512`).reply(404);
      scope(nodeUrl)
        .get(`/dist/v${version}/SHASUMS256.txt`)
        .reply(200, `${checksum(tarball)}  ${distFile}\n`)
        .get(`/dist/v${version}/${distFile}`)
        .reply(200, tarball);
      vi.spyOn(CompressionService.prototype, 'extract').mockResolvedValue();
      execaMock.mockResolvedValueOnce({ failed: true, all: 'npm error' });

      await expect(svc.install(version)).rejects.toThrow(
        'node-gyp update command failed',
      );

      const entries = await fs.readdir(rootPath('tmp'));
      expect(entries.some((e) => e.startsWith('containerbase-npm-'))).toBe(
        false,
      );
    });

    test('install falls back to nodejs.org and updates node-gyp', async () => {
      const { svc, pathSvc } = await toolContext(NodeInstallService);
      const version = '14.21.3';
      const filename = `${version}/node-${version}-x86_64.tar.xz`;
      const distFile = `node-v${version}-linux-x64.tar.xz`;
      scope(ghUrl).head(`${prebuild}/${filename}.sha512`).reply(404);
      scope(nodeUrl)
        .get(`/dist/v${version}/SHASUMS256.txt`)
        .reply(200, `${checksum(tarball)}  ${distFile}\n`)
        .get(`/dist/v${version}/${distFile}`)
        .reply(200, tarball);

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        join(pathSvc.versionedToolPath('node', version), 'bin/npm'),
        expect.arrayContaining(['install', 'node-gyp@latest']),
        expect.objectContaining({ reject: false }),
      );
    });

    test('install falls back to nodejs.org on arm64', async () => {
      vi.mocked(arch).mockReturnValue('arm64');
      const { svc } = await toolContext(NodeInstallService);
      const version = '22.14.0';
      const filename = `${version}/node-${version}-aarch64.tar.xz`;
      const distFile = `node-v${version}-linux-arm64.tar.xz`;
      scope(ghUrl).head(`${prebuild}/${filename}.sha512`).reply(404);
      scope(nodeUrl)
        .get(`/dist/v${version}/SHASUMS256.txt`)
        .reply(200, `${checksum(tarball)}  ${distFile}\n`)
        .get(`/dist/v${version}/${distFile}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(distFile),
        cwd: expect.any(String),
        strip: 1,
      });
    });

    describe('with tool-versions data', () => {
      /**
       * The files of a node version as tool-versions publishes them: the
       * nodejs.org archives and, optionally, the containerbase prebuilds.
       */
      function versionFiles(version: string, prebuilds: boolean): VersionFiles {
        const archives = [
          { name: `node-v${version}-linux-arm64.tar.xz`, arch: 'arm64' },
          { name: `node-v${version}-linux-x64.tar.xz`, arch: 'amd64' },
        ].map(({ name, arch }) => ({
          name,
          url: `${nodeUrl}/dist/v${version}/${name}`,
          checksum: `sha256:${checksum(tarball)}`,
          arch,
        }));
        const builds = [
          { name: `node-${version}-aarch64.tar.xz`, arch: 'arm64' },
          { name: `node-${version}-x86_64.tar.xz`, arch: 'amd64' },
        ].map(({ name, arch }) => ({
          name,
          url: `${ghUrl}${prebuild}/${version}/${name}`,
          checksum: `sha512:${checksum(tarball, 'sha512')}`,
          arch,
        }));
        return {
          tool: 'node',
          version,
          files: prebuilds ? [...builds, ...archives] : archives,
        };
      }

      test('install: downloads the listed prebuild when both are listed', async () => {
        const version = '24.10.0';
        vi.spyOn(
          ToolVersionsService.prototype,
          'getVersionFiles',
        ).mockResolvedValue(versionFiles(version, true));
        // no checksum files and no release checks
        scope(ghUrl)
          .get(`${prebuild}/${version}/node-${version}-x86_64.tar.xz`)
          .reply(200, tarball);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');
        const { svc, pathSvc } = await toolContext(NodeInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`node-${version}-x86_64.tar.xz`),
          cwd: pathSvc.versionedToolPath('node', version),
          strip: 1,
        });
        expect(logger.debug).not.toHaveBeenCalledWith(
          expect.anything(),
          'no tool-versions file for the host',
        );
      });

      test('install: downloads the prebuild release without a listed prebuild', async () => {
        const version = '24.10.1';
        vi.spyOn(
          ToolVersionsService.prototype,
          'getVersionFiles',
        ).mockResolvedValue(versionFiles(version, false));
        const filename = `${version}/node-${version}-x86_64.tar.xz`;
        scope(ghUrl)
          .head(`${prebuild}/${filename}.sha512`)
          .reply(200)
          .get(`${prebuild}/${filename}.sha512`)
          .reply(200, `${checksum(tarball, 'sha512')}\n`)
          .get(`${prebuild}/${filename}`)
          .reply(200, tarball);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');
        const { svc } = await toolContext(NodeInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`node-${version}-x86_64.tar.xz`),
          cwd: expect.any(String),
          strip: 1,
        });
      });

      test('install: downloads the listed archive without any prebuild', async () => {
        const version = '24.10.3';
        vi.spyOn(
          ToolVersionsService.prototype,
          'getVersionFiles',
        ).mockResolvedValue(versionFiles(version, false));
        const distFile = `node-v${version}-linux-x64.tar.xz`;
        scope(ghUrl)
          .head(`${prebuild}/${version}/node-${version}-x86_64.tar.xz.sha512`)
          .reply(404);
        // no `SHASUMS256.txt`
        scope(nodeUrl).get(`/dist/v${version}/${distFile}`).reply(200, tarball);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');
        const { svc } = await toolContext(NodeInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(distFile),
          cwd: expect.any(String),
          strip: 1,
        });
      });

      test('install: checks the release for a listed prebuild with an unsupported checksum', async () => {
        const version = '24.10.4';
        const data = versionFiles(version, true);
        vi.spyOn(
          ToolVersionsService.prototype,
          'getVersionFiles',
        ).mockResolvedValue({
          ...data,
          files: data.files.map((f) =>
            f.name.endsWith('-x86_64.tar.xz')
              ? { ...f, checksum: `md5:${'a'.repeat(32)}` }
              : f,
          ),
        });
        const distFile = `node-v${version}-linux-x64.tar.xz`;
        // the prebuild isn't usable, so the release is checked
        scope(ghUrl)
          .head(`${prebuild}/${version}/node-${version}-x86_64.tar.xz.sha512`)
          .reply(404);
        scope(nodeUrl).get(`/dist/v${version}/${distFile}`).reply(200, tarball);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');
        const { svc } = await toolContext(NodeInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(distFile),
          cwd: expect.any(String),
          strip: 1,
        });
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ tool: 'node', version }),
          'unsupported tool-versions file checksum',
        );
      });

      test('install: uses SHASUMS256.txt when neither file is listed for the host', async () => {
        const version = '24.10.5';
        const data = versionFiles(version, true);
        vi.spyOn(
          ToolVersionsService.prototype,
          'getVersionFiles',
        ).mockResolvedValue({
          ...data,
          files: data.files.filter((f) => f.arch === 'arm64'),
        });
        const distFile = `node-v${version}-linux-x64.tar.xz`;
        scope(ghUrl)
          .head(`${prebuild}/${version}/node-${version}-x86_64.tar.xz.sha512`)
          .reply(404);
        scope(nodeUrl)
          .get(`/dist/v${version}/SHASUMS256.txt`)
          .reply(200, `${checksum(tarball)}  ${distFile}\n`)
          .get(`/dist/v${version}/${distFile}`)
          .reply(200, tarball);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');
        const { svc } = await toolContext(NodeInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(distFile),
          cwd: expect.any(String),
          strip: 1,
        });
      });

      test('install: checks the release without a file for the host', async () => {
        const version = '24.10.2';
        const data = versionFiles(version, true);
        vi.spyOn(
          ToolVersionsService.prototype,
          'getVersionFiles',
        ).mockResolvedValue({
          ...data,
          files: data.files.filter((f) => f.arch === 'arm64'),
        });
        const filename = `${version}/node-${version}-x86_64.tar.xz`;
        scope(ghUrl)
          .head(`${prebuild}/${filename}.sha512`)
          .reply(200)
          .get(`${prebuild}/${filename}.sha512`)
          .reply(200, `${checksum(tarball, 'sha512')}\n`)
          .get(`${prebuild}/${filename}`)
          .reply(200, tarball);
        const { svc } = await toolContext(NodeInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();
      });
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(NodeInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const src = join(pathSvc.versionedToolPath('node', '22.11.0'), 'bin');

      await expect(svc.link('22.11.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledWith('node', { srcDir: src });
      expect(spy).toHaveBeenCalledWith('node', { srcDir: src, name: 'npm' });
      expect(spy).toHaveBeenCalledWith('node', { srcDir: src, name: 'npx' });
    });

    test('link and test also cover corepack when shipped', async () => {
      const { svc, pathSvc } = await toolContext(NodeInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const src = join(pathSvc.versionedToolPath('node', '22.13.0'), 'bin');
      await fs.mkdir(src, { recursive: true });
      await fs.writeFile(join(src, 'corepack'), '');

      await expect(svc.postInstall('22.13.0')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(4);
      expect(spy).toHaveBeenCalledWith('node', {
        srcDir: src,
        name: 'corepack',
      });

      await expect(svc.test('22.13.0')).resolves.toBeUndefined();
      expect(execaMock).toHaveBeenCalledWith(
        'corepack',
        ['--version'],
        expect.any(Object),
      );
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(NodeInstallService);

      await expect(svc.test('22.11.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'node',
        ['--version'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'npm',
        ['--version'],
        expect.any(Object),
      );
    });
  });

  describe('NodePrepareService', () => {
    test('initialize and prepare', async () => {
      // CI configures an apt proxy, which `AptService` would write to `/etc`
      vi.stubEnv('APT_HTTP_PROXY', undefined);
      const { svc, child } = await toolContext(NodePrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        expect.arrayContaining(['libatomic1']),
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );

      const env = await fs.readFile(
        join(pathSvc.toolPath('node'), 'env.sh'),
        'utf8',
      );
      expect(env).toContain(
        'export NO_UPDATE_NOTIFIER=${NO_UPDATE_NOTIFIER-1}',
      );
      expect(env).toContain('--use-openssl-ca');
      expect(await fs.readlink(join(envSvc.userHome, '.npm'))).toBe(
        join(pathSvc.cachePath, '.npm'),
      );
      expect((await fs.stat(join(envSvc.userHome, '.npm'))).isDirectory()).toBe(
        true,
      );
      expect(await fs.readlink(join(envSvc.userHome, '.yarn'))).toBe(
        join(pathSvc.cachePath, '.yarn'),
      );
      expect(
        (await fs.stat(join(envSvc.userHome, '.yarn'))).isDirectory(),
      ).toBe(true);

      // the tool env is only written once
      await expect(svc.initialize()).resolves.toBeUndefined();
      expect(
        await fs.readFile(join(pathSvc.toolPath('node'), 'env.sh'), 'utf8'),
      ).toBe(env);
    });
  });
});
