import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
  PathService,
} from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';
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
vi.mock('../../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/index.ts')>()),
  getDistro: vi.fn(),
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
    // the node-gyp update cleans up `$HOME/.npm/_logs`
    vi.stubEnv('HOME', rootPath('home/ubuntu'));
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
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

    test('install from the distro specific prebuild', async () => {
      const { svc } = await toolContext(NodeInstallService);
      const version = '22.12.0';
      const filename = `${version}/node-${version}-x86_64.tar.xz`;
      // the distro specific url is built with a leading space in the path
      const distroFile = `%20${version}/node-${version}-noble-x86_64.tar.xz`;
      scope(ghUrl)
        .head(`${prebuild}/${filename}.sha512`)
        .reply(404)
        .head(`${prebuild}/${distroFile}.sha512`)
        .reply(200)
        .get(`${prebuild}/${distroFile}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${prebuild}/${distroFile}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledOnce();
    });

    test('install falls back to nodejs.org and updates node-gyp', async () => {
      const { svc, pathSvc } = await toolContext(NodeInstallService);
      const version = '14.21.3';
      const filename = `${version}/node-${version}-x86_64.tar.xz`;
      const distroFile = `%20${version}/node-${version}-noble-x86_64.tar.xz`;
      const distFile = `node-v${version}-linux-x64.tar.xz`;
      scope(ghUrl)
        .head(`${prebuild}/${filename}.sha512`)
        .reply(404)
        .head(`${prebuild}/${distroFile}.sha512`)
        .reply(404);
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
      const distroFile = `%20${version}/node-${version}-noble-aarch64.tar.xz`;
      const distFile = `node-v${version}-linux-arm64.tar.xz`;
      scope(ghUrl)
        .head(`${prebuild}/${filename}.sha512`)
        .reply(404)
        .head(`${prebuild}/${distroFile}.sha512`)
        .reply(404);
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
      const { svc, child } = await toolContext(NodePrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

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

      // the tool env is only written once
      await expect(svc.initialize()).resolves.toBeUndefined();
      expect(
        await fs.readFile(join(pathSvc.toolPath('node'), 'env.sh'), 'utf8'),
      ).toBe(env);
    });
  });
});
