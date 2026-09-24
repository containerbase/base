import fs from 'node:fs/promises';
import { join } from 'node:path';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  EnvService,
  LinkToolService,
  PathService,
  VersionService,
} from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import {
  NpmBaseInstallService,
  prepareGlobalConfig,
  prepareNpmCache,
  prepareNpmrc,
  prepareSymlinks,
  prepareUserConfig,
} from './utils.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const nodeVersion = '22.0.0';

@injectable()
@injectFromHierarchy()
class CorepackInstallService extends NpmBaseInstallService {
  readonly name = 'corepack';
}

@injectable()
@injectFromHierarchy()
class NpmInstallService extends NpmBaseInstallService {
  readonly name = 'npm';
}

/** A tool published under a scoped package name. */
@injectable()
@injectFromHierarchy()
class ScopedInstallService extends NpmBaseInstallService {
  readonly name = 'yarn';

  /** Installs the scoped `@yarnpkg/cli-dist` package. */
  protected override tool(): string {
    return '@yarnpkg/cli-dist';
  }
}

/**
 * Write the `package.json` npm would have created for an installed package, so
 * `isInstalled` and `postInstall` can read it back.
 */
async function writePackageJson(
  pathSvc: PathService,
  tool: string,
  version: string,
  content: unknown,
): Promise<void> {
  const dir = join(
    pathSvc.versionedToolPath(tool, version),
    nodeVersion,
    'node_modules',
    tool,
  );
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(join(dir, 'package.json'), JSON.stringify(content));
}

describe('cli/tools/node/utils', () => {
  let child!: Container;
  let envSvc!: EnvService;
  let pathSvc!: PathService;

  beforeAll(async () => {
    await ensurePaths([
      'home/ubuntu',
      'tmp',
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'opt/containerbase/versions',
    ]);

    const verSvc = await (await testContainer()).getAsync(VersionService);
    await verSvc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: nodeVersion },
    });
  });

  beforeEach(async () => {
    // the npm install cleans up `$HOME/.npm/_logs`
    vi.stubEnv('HOME', rootPath('home/ubuntu'));
    child = await testContainer();
    child.bind(CorepackInstallService).toSelf();
    child.bind(NpmInstallService).toSelf();
    child.bind(ScopedInstallService).toSelf();
    envSvc = await child.getAsync(EnvService);
    pathSvc = await child.getAsync(PathService);
  });

  describe('NpmBaseInstallService', () => {
    test('install', async () => {
      execaMock.mockResolvedValue({ failed: false, all: 'ok' });
      const svc = await child.getAsync(CorepackInstallService);

      await expect(svc.install('1.0.0')).resolves.toBeUndefined();

      const prefix = join(
        pathSvc.versionedToolPath('corepack', '1.0.0'),
        nodeVersion,
      );
      expect(await fs.readlink(join(prefix, 'bin'))).toBe(
        `${prefix}/node_modules/.bin`,
      );
      expect(execaMock).toHaveBeenCalledWith(
        join(pathSvc.versionedToolPath('node', nodeVersion), 'bin/npm'),
        expect.arrayContaining(['install', 'corepack@1.0.0', '--prefix']),
        expect.objectContaining({ cwd: pathSvc.installDir }),
      );
    });

    test('install: reuses an existing tool path', async () => {
      execaMock.mockResolvedValue({ failed: false, all: 'ok' });
      const svc = await child.getAsync(CorepackInstallService);

      await pathSvc.createVersionedToolPath('corepack', '1.0.1');
      await expect(svc.install('1.0.1')).resolves.toBeUndefined();
    });

    test('install: updates node-gyp for npm v6', async () => {
      execaMock.mockImplementation(async (_cmd, args: string[]) => {
        if (args[1] === 'npm@6.14.18') {
          await writePackageJson(pathSvc, 'npm', '6.14.18', {
            name: 'npm',
            version: '6.14.18',
          });
        }
        return { failed: false, all: 'ok' };
      });
      const svc = await child.getAsync(NpmInstallService);

      await expect(svc.install('6.14.18')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        expect.stringContaining('bin/npm'),
        expect.arrayContaining(['install', 'node-gyp@latest']),
        expect.objectContaining({ reject: false }),
      );
    });

    test('install: throws when the node-gyp update fails', async () => {
      execaMock.mockImplementation(async (_cmd, args: string[]) => {
        if (args.includes('node-gyp@latest')) {
          return { failed: true, all: 'gyp boom' };
        }
        if (args[1] === 'npm@6.14.17') {
          await writePackageJson(pathSvc, 'npm', '6.14.17', {
            name: 'npm',
            version: '6.14.17',
          });
        }
        return { failed: false, all: 'ok' };
      });
      const svc = await child.getAsync(NpmInstallService);

      await expect(svc.install('6.14.17')).rejects.toThrow(
        'node-gyp update command failed',
      );
      expect(logger.warn).toHaveBeenCalledWith('Npm error:\ngyp boom');
    });

    test('install: throws and cleans up on failure', async () => {
      execaMock.mockResolvedValue({ failed: true, all: 'boom' });
      const svc = await child.getAsync(CorepackInstallService);

      await expect(svc.install('2.0.0')).rejects.toThrow(
        'npm install command failed',
      );
      expect(logger.warn).toHaveBeenCalledWith('Npm error:\nboom');
      await expect(
        fs.stat(
          join(pathSvc.versionedToolPath('corepack', '2.0.0'), nodeVersion),
        ),
      ).rejects.toThrow();
    });

    test('install: uses the replaced npm registry', async () => {
      vi.stubEnv('CONTAINERBASE_CDN_NPM', 'true');
      vi.stubEnv('URL_REPLACE_0_FROM', 'https://registry.npmjs.org/');
      vi.stubEnv('URL_REPLACE_0_TO', 'https://npm.example.com/');
      vi.stubEnv('npm_config_cache', '');
      vi.stubEnv('NPM_CONFIG_CACHE', '');
      execaMock.mockResolvedValue({ failed: false, all: 'ok' });
      const svc = await child.getAsync(CorepackInstallService);

      await expect(svc.install('3.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            npm_config_registry: 'https://npm.example.com/',
            npm_config_cache: expect.stringContaining('containerbase-npm-'),
          }),
        }),
      );
    });

    test('isInstalled', async () => {
      const svc = await child.getAsync(CorepackInstallService);

      expect(await svc.isInstalled('9.9.9')).toBe(false);
      await writePackageJson(pathSvc, 'corepack', '9.9.9', {
        name: 'corepack',
      });
      expect(await svc.isInstalled('9.9.9')).toBe(true);
    });

    test('link: string bin', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const svc = await child.getAsync(CorepackInstallService);
      await writePackageJson(pathSvc, 'corepack', '4.0.0', {
        name: 'corepack',
        bin: './bin/corepack.js',
      });

      await expect(svc.link('4.0.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('corepack', {
        srcDir: join(
          pathSvc.versionedToolPath('corepack', '4.0.0'),
          nodeVersion,
          'bin',
        ),
        name: 'corepack',
      });
    });

    test('link: bin map', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const svc = await child.getAsync(CorepackInstallService);
      await writePackageJson(pathSvc, 'corepack', '5.0.0', {
        name: 'corepack',
        bin: { corepack: './dist/corepack.js', pnpm: './dist/pnpm.js' },
      });

      await expect(svc.link('5.0.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('corepack', {
        srcDir: expect.any(String),
        name: 'pnpm',
        extraToolEnvs: ['node'],
      });
    });

    test('link: missing bin', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const svc = await child.getAsync(CorepackInstallService);
      await writePackageJson(pathSvc, 'corepack', '6.0.0', {
        name: 'corepack',
      });

      await expect(svc.link('6.0.0')).resolves.toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { tool: 'corepack', version: '6.0.0' },
        "Missing 'bin' in package.json",
      );
    });

    test('runs the tool test', async () => {
      execaMock.mockResolvedValue({ failed: false });
      const svc = await child.getAsync(CorepackInstallService);

      await expect(svc.test('1.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'corepack',
        ['--version'],
        expect.objectContaining({ cwd: envSvc.tmpDir }),
      );
    });

    test('install: keeps node-gyp for npm v7 and later', async () => {
      execaMock.mockImplementation(async (_cmd, args: string[]) => {
        if (args[1] === 'npm@10.9.0') {
          await writePackageJson(pathSvc, 'npm', '10.9.0', {
            name: 'npm',
            version: '10.9.0',
          });
        }
        return { failed: false, all: 'ok' };
      });
      const svc = await child.getAsync(NpmInstallService);

      await expect(svc.install('10.9.0')).resolves.toBeUndefined();

      expect(execaMock).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['node-gyp@latest']),
        expect.any(Object),
      );
    });

    test('install: keeps an existing npm cache setting', async () => {
      vi.stubEnv('npm_config_cache', '/var/cache/npm');
      vi.stubEnv('NODE_OPTIONS', '--max-old-space-size=4096');
      execaMock.mockResolvedValue({ failed: false, all: 'ok' });
      const svc = await child.getAsync(CorepackInstallService);

      await expect(svc.install('7.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            NODE_OPTIONS: '--max-old-space-size=4096 --use-openssl-ca',
          }),
        }),
      );
      expect(execaMock).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            npm_config_cache: expect.any(String),
          }),
        }),
      );
    });

    test('link: falls back to the tool name without a package name', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const svc = await child.getAsync(CorepackInstallService);
      await writePackageJson(pathSvc, 'corepack', '8.0.0', {
        bin: './bin/corepack.js',
      });

      await expect(svc.link('8.0.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('corepack', {
        srcDir: expect.any(String),
        name: 'corepack',
      });
    });

    test('test: strips the scope from the package name', async () => {
      execaMock.mockResolvedValue({ failed: false });
      const svc = await child.getAsync(ScopedInstallService);

      await expect(svc.test('4.5.3')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'cli-dist',
        ['--version'],
        expect.any(Object),
      );
    });

    test('throws without a current node', async () => {
      const verSvc = await child.getAsync(VersionService);
      await verSvc.removeCurrent('node');
      try {
        const svc = await child.getAsync(CorepackInstallService);
        await expect(svc.isInstalled('1.0.0')).rejects.toThrow(
          'Node not installed',
        );
      } finally {
        await verSvc.setCurrent({
          name: 'node',
          tool: { name: 'node', version: nodeVersion },
        });
      }
    });
  });

  describe('helpers', () => {
    test('prepareNpmCache', async () => {
      await expect(prepareNpmCache(pathSvc)).resolves.toBeUndefined();
      expect(
        (await fs.stat(join(pathSvc.cachePath, '.npm'))).isDirectory(),
      ).toBe(true);
    });

    test('prepareNpmrc', async () => {
      const npmrc = join(pathSvc.cachePath, '.npmrc');

      await expect(prepareNpmrc(pathSvc)).resolves.toBeUndefined();
      expect(await fs.readFile(npmrc, 'utf8')).toBe('');

      // keeps an existing file
      await fs.writeFile(npmrc, 'registry=https://example.com');
      await expect(prepareNpmrc(pathSvc)).resolves.toBeUndefined();
      expect(await fs.readFile(npmrc, 'utf8')).toBe(
        'registry=https://example.com',
      );
    });

    test('prepareSymlinks', async () => {
      await expect(prepareSymlinks(envSvc, pathSvc)).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.npm'))).toBe(
        join(pathSvc.cachePath, '.npm'),
      );
      expect(await fs.readlink(join(envSvc.userHome, '.npmrc'))).toBe(
        join(pathSvc.cachePath, '.npmrc'),
      );
    });

    test('prepareGlobalConfig', async () => {
      const prefix = rootPath('usr/local');
      const versionedToolPath = rootPath('opt/containerbase/tools/n/1.0.0');

      await expect(
        prepareGlobalConfig({ prefix, versionedToolPath }),
      ).resolves.toBeUndefined();

      expect((await fs.stat(join(prefix, 'lib'))).isDirectory()).toBe(true);
      expect(
        await fs.readFile(join(versionedToolPath, 'etc/npmrc'), 'utf8'),
      ).toBe(`prefix = "${prefix}"`);
    });

    test('prepareUserConfig', async () => {
      execaMock.mockResolvedValue({ failed: false });
      const home = rootPath('home/user-config');
      const prefix = join(home, 'prefix');
      await fs.mkdir(home, { recursive: true });

      await expect(
        prepareUserConfig({ prefix, home, name: 'ubuntu' }),
      ).resolves.toBeUndefined();

      expect(await fs.readFile(join(home, '.npmrc'), 'utf8')).toBe(
        `prefix = "${prefix}"`,
      );
      expect(execaMock).toHaveBeenCalledWith(
        'chown',
        ['-R', 'ubuntu', prefix, `${home}/.npmrc`, `${home}/.npm`],
        expect.any(Object),
      );
    });

    test('prepareUserConfig: keeps an existing prefix', async () => {
      const home = rootPath('home/user-existing');
      const prefix = join(home, 'prefix');
      await fs.mkdir(home, { recursive: true });
      await fs.writeFile(join(home, '.npmrc'), 'prefix = "/somewhere"');

      await expect(
        prepareUserConfig({ prefix, home, name: 'ubuntu' }),
      ).resolves.toBeUndefined();

      expect(await fs.readFile(join(home, '.npmrc'), 'utf8')).toBe(
        'prefix = "/somewhere"',
      );
      expect(execaMock).not.toHaveBeenCalled();
    });
  });
});
