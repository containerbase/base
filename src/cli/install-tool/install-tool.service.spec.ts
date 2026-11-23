import fs from 'node:fs/promises';
import { join } from 'node:path';
import { deleteAsync } from 'del';
import {
  type Container,
  inject,
  injectFromHierarchy,
  injectable,
} from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { initializeTools, prepareTools } from '../prepare-tool/index.ts';
import {
  CacheService,
  EnvService,
  LinkToolService,
  PathService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { BunInstallService } from '../tools/bun.ts';
import {
  BlockingChild,
  CommandNotFound,
  MissingParent,
  NotRoot,
  NotSupported,
} from '../utils/codes.ts';
import { isDockerBuild, logger, pathExists } from '../utils/index.ts';
import { BaseInstallService } from './base-install.service.ts';
import {
  V1ToolInstallService,
  V2ToolInstallService,
} from './install-legacy-tool.service.ts';
import {
  INSTALL_TOOL_TOKEN,
  InstallToolService,
} from './install-tool.service.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

vi.mock('del');
const actualDel = await vi.importActual<typeof import('del')>('del');
vi.mock('execa');
vi.mock('../tools/bun.ts');
vi.mock('../tools/php/composer.ts');
vi.mock('../prepare-tool/index.ts');
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  isDockerBuild: vi.fn(),
}));

@injectable()
@injectFromHierarchy()
abstract class TestInstallService extends BaseInstallService {
  /** Does nothing, for tests. */
  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }
}

/** a tool which can only be installed at image build time, like `git` */
@injectable()
@injectFromHierarchy()
class RootOnlyInstallService extends TestInstallService {
  override readonly name = 'root-only';

  override readonly needsRoot = true;
}

/** a tool which is installed system wide, like `git` */
@injectable()
@injectFromHierarchy()
class NoUninstallInstallService extends TestInstallService {
  override readonly name = 'no-uninstall';

  override readonly canUninstall = false;
}

/** a v2 shell tool, which doesn't have to install into its versioned path */
@injectable()
@injectFromHierarchy()
class ShellInstallService extends V2ToolInstallService {
  readonly name = 'shell-tool';

  /** Does nothing, for tests. */
  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override link(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override postInstall(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Does nothing, for tests. */
  override test(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Needs no prepare step, for tests. */
  override needsPrepare(): boolean {
    return false;
  }

  /** Needs no initialize step, for tests. */
  override needsInitialize(): boolean {
    return false;
  }

  /** Accepts any version, for tests. */
  override validate(_version: string): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** a tool installed into a folder per version of its parent `host` */
@injectable()
@injectFromHierarchy()
class ScopedInstallService extends TestInstallService {
  @inject(VersionService)
  private readonly versionSvc!: VersionService;

  override readonly name = 'scoped';
  override readonly parent = 'host';
  override readonly parentScoped = true;

  /** Creates the folder for the current version of the parent. */
  override async install(version: string): Promise<void> {
    const host = (await this.versionSvc.getCurrent('host'))!;
    await this.pathSvc.createDir(this.versionDir(version, host.tool.version));
  }
}

/**
 * a tool with a command per major version, like python with `python3.11`,
 * which installs into its versioned tool path
 */
@injectable()
@injectFromHierarchy()
class MultiInstallService extends TestInstallService {
  override readonly name = 'multi';

  /** Creates the versioned tool path. */
  override async install(version: string): Promise<void> {
    await this.pathSvc.createVersionedToolPath(this.name, version);
  }

  /** Links `multi` and the command of the major version. */
  override async link(version: string): Promise<void> {
    const srcDir = '/bin/bash';
    await this.shellwrapper({ srcDir });
    await this.shellwrapper({
      srcDir,
      name: `multi${version.split('.')[0]}`,
    });
  }
}

/** a tool installed into a folder per version of its parent `multi` */
@injectable()
@injectFromHierarchy()
class ChildInstallService extends TestInstallService {
  @inject(VersionService)
  private readonly versionSvc!: VersionService;

  override readonly name = 'child';
  override readonly parent = 'multi';
  override readonly parentScoped = true;

  /** The folder for the current version of the parent. */
  private async dir(version: string): Promise<string> {
    const multi = (await this.versionSvc.getCurrent('multi'))!;
    return this.versionDir(version, multi.tool.version);
  }

  /** Creates the folder for the current version of the parent. */
  override async install(version: string): Promise<void> {
    await this.pathSvc.createDir(await this.dir(version));
  }

  /** Whether the folder for the current version of the parent exists. */
  override async isInstalled(version: string): Promise<boolean> {
    return await pathExists(await this.dir(version), 'dir');
  }

  /** Links `child`. */
  override async link(_version: string): Promise<void> {
    await this.shellwrapper({ srcDir: '/bin/bash' });
  }
}

/** a tool whose parent has no install service */
@injectable()
@injectFromHierarchy()
class OrphanInstallService extends TestInstallService {
  override readonly name = 'orphan';
  override readonly parent = 'ghost';

  /** Links `orphan-cmd`. */
  override async link(_version: string): Promise<void> {
    await this.shellwrapper({ srcDir: '/bin/bash', name: 'orphan-cmd' });
  }
}

/** a tool whose parent can only be installed as root */
@injectable()
@injectFromHierarchy()
class StuckInstallService extends TestInstallService {
  override readonly name = 'stuck';
  override readonly parent = 'root-only';
}

/** The pointer of a command. */
function linkPath(name: string): string {
  return rootPath(`opt/containerbase/links/${name}`);
}

/** The shim of a command. */
function binPath(name: string): string {
  return rootPath(`opt/containerbase/bin/${name}`);
}

describe('cli/install-tool/install-tool.service', () => {
  const parent = createContainer();
  parent.bind(InstallToolService).toSelf();
  parent.bind(V1ToolInstallService).toSelf();
  parent.bind(INSTALL_TOOL_TOKEN).to(ScopedInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(BunInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(ShellInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(RootOnlyInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(NoUninstallInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(MultiInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(ChildInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(OrphanInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(StuckInstallService);

  let child: Container;
  let install: InstallToolService;
  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'opt/containerbase/links',
      'opt/containerbase/versions',
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools',
      'var/lib/containerbase/tool.prep.d',
    ]);
    await fs.writeFile(rootPath('usr/local/containerbase/tools/leg.sh'), '');
  });

  beforeEach(async () => {
    child = createContainer(parent);
    install = await child.getAsync(InstallToolService);
  });

  describe('install', () => {
    test('writes version if tool is not installed', async () => {
      const ver = await child.getAsync(VersionService);
      vi.mocked(
        BunInstallService.prototype,
      ).needsInitialize.mockReturnValueOnce(true);
      vi.mocked(BunInstallService.prototype).needsPrepare.mockReturnValueOnce(
        true,
      );
      expect(await install.install('bun', '1.0.0')).toBeUndefined();
      expect(await ver.getCurrent('bun')).toMatchObject({
        name: 'bun',
        tool: { name: 'bun', version: '1.0.0' },
      });
    });

    test('fails if the tool needs root', async () => {
      expect(await install.install('root-only', '1.0.0')).toBe(NotRoot);
      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'root-only' },
        'tool must be installed as root',
      );
    });

    test('writes version even if tool is installed', async () => {
      const ver = await child.getAsync(VersionService);
      vi.mocked(BunInstallService.prototype).isInstalled.mockResolvedValueOnce(
        true,
      );
      expect(await install.install('bun', '1.0.1')).toBeUndefined();
      expect(await ver.getCurrent('bun')).toMatchObject({
        name: 'bun',
        tool: { name: 'bun', version: '1.0.1' },
      });
    });

    test('dry run', async () => {
      expect(await install.install('bun', '1.0.2', true)).toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith('Dry run: install tool bun ...');
    });

    test('rejects an unsupported version', async () => {
      expect(await install.install('bun', 'not-a-version')).toBe(1);

      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'bun', version: 'not-a-version' },
        'tool version not supported',
      );
    });

    test('cleans up the tool on failure', async () => {
      vi.spyOn(BunInstallService.prototype, 'install').mockRejectedValueOnce(
        new Error('install failed'),
      );

      await expect(install.install('bun', '1.0.3')).rejects.toThrow(
        'install failed',
      );

      const ver = await child.getAsync(VersionService);
      expect(await ver.isInstalled({ name: 'bun', version: '1.0.3' })).toBe(
        false,
      );
    });

    test('a failed install for a parent version keeps the other parents', async () => {
      const ver = await child.getAsync(VersionService);
      const pathSvc = await child.getAsync(PathService);
      const host = (version: string) => ({
        name: 'host',
        tool: { name: 'host', version },
      });
      // the cleanup removes the real folders
      vi.mocked(deleteAsync).mockImplementation(actualDel.deleteAsync);
      await ver.setCurrent(host('1.0.0'));
      expect(await install.install('scoped', '1.0.0')).toBeUndefined();
      await ver.setCurrent(host('2.0.0'));
      vi.spyOn(
        ScopedInstallService.prototype,
        'install',
      ).mockImplementationOnce(async function () {
        await fs.mkdir(
          join(pathSvc.versionedToolPath('scoped', '1.0.0'), '2.0.0'),
          { recursive: true },
        );
        throw new Error('install failed');
      });

      await expect(install.install('scoped', '1.0.0')).rejects.toThrow(
        'install failed',
      );

      const dir = pathSvc.versionedToolPath('scoped', '1.0.0');
      expect(await pathExists(join(dir, '1.0.0'), 'dir')).toBe(true);
      expect(await pathExists(join(dir, '2.0.0'), 'dir')).toBe(false);
      expect(
        await ver.isInstalled({
          name: 'scoped',
          version: '1.0.0',
          parent: { name: 'host', version: '1.0.0' },
        }),
      ).toBe(true);
      expect(
        await ver.isInstalled({
          name: 'scoped',
          version: '1.0.0',
          parent: { name: 'host', version: '2.0.0' },
        }),
      ).toBe(false);
    });

    test('the cleanup of a failed install stays inside the tool folder', async () => {
      const ver = await child.getAsync(VersionService);
      const pathSvc = await child.getAsync(PathService);
      vi.mocked(deleteAsync).mockImplementation(actualDel.deleteAsync);
      await ver.setCurrent({
        name: 'host',
        tool: { name: 'host', version: '3.0.0' },
      });
      // `tools/x` is next to the folder of the tool
      const outside = join(pathSvc.toolsPath, 'x', '3.0.0', 'keep');
      await fs.mkdir(join(pathSvc.toolsPath, 'x', '3.0.0'), {
        recursive: true,
      });
      await fs.writeFile(outside, '');
      vi.spyOn(ScopedInstallService.prototype, 'validate').mockResolvedValue(
        true,
      );
      vi.spyOn(ScopedInstallService.prototype, 'install').mockRejectedValueOnce(
        new Error('install failed'),
      );

      await expect(install.install('scoped', '../x')).rejects.toThrow();

      expect(await pathExists(outside, 'file')).toBe(true);
    });

    test('cleans the caches on a docker build', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);

      expect(await install.install('bun', '1.0.4')).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith('cleaning tmp files');
      expect(logger.debug).toHaveBeenCalledWith('cleaning user caches');
    });

    test('removes read-only user caches on a docker build', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const { cachePath } = await child.getAsync(PathService);
      const cacheDir = join(cachePath, '.cache');
      const image = join(cacheDir, 'virtualenv/wheel/image');
      await fs.mkdir(image, { recursive: true });
      await fs.writeFile(join(image, 'file'), '');
      await fs.chmod(image, 0o555);
      const venv = join(cachePath, '.local/share/virtualenv');
      await fs.mkdir(venv, { recursive: true });

      expect(await install.install('bun', '1.0.6')).toBeUndefined();

      expect(await fs.readdir(cacheDir)).toEqual([]);
      expect(await pathExists(venv)).toBe(false);
    });

    test('keeps the user caches on a dry run', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const { cachePath } = await child.getAsync(PathService);
      const file = join(cachePath, '.cache/tool/file');
      await fs.mkdir(join(file, '..'), { recursive: true });
      await fs.writeFile(file, '');

      expect(await install.install('bun', '1.0.7', true)).toBeUndefined();

      expect(await pathExists(file, 'file')).toBe(true);
    });

    test('cleans the root caches when running as root', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);

      expect(await install.install('bun', '1.0.5')).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith('cleaning apt caches');
      expect(logger.debug).toHaveBeenCalledWith('cleaning root caches');
    });

    test('evicts the download cache', async () => {
      const spy = vi.spyOn(CacheService.prototype, 'evict');

      expect(await install.install('bun', '1.0.8')).toBeUndefined();
      expect(spy).toHaveBeenCalledExactlyOnceWith(false);

      expect(await install.install('bun', '1.0.9', true)).toBeUndefined();
      expect(spy).toHaveBeenLastCalledWith(true);
    });

    test('a failing eviction does not fail the install', async () => {
      const err = new Error('evict failed');
      vi.spyOn(CacheService.prototype, 'evict').mockRejectedValueOnce(err);

      expect(await install.install('bun', '1.0.10')).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { err },
        'cannot evict the download cache',
      );
    });

    test('a failing eviction keeps the install error', async () => {
      vi.spyOn(BunInstallService.prototype, 'install').mockRejectedValueOnce(
        new Error('install failed'),
      );
      vi.spyOn(CacheService.prototype, 'evict').mockRejectedValueOnce(
        new Error('evict failed'),
      );

      await expect(install.install('bun', '1.0.11')).rejects.toThrow(
        'install failed',
      );
    });

    test('skips the tool test when requested', async () => {
      vi.spyOn(EnvService.prototype, 'skipTests', 'get').mockReturnValue(true);
      const spy = vi.spyOn(BunInstallService.prototype, 'test');

      expect(await install.install('bun', '1.0.6')).toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
    });

    test('does not relink an already linked tool', async () => {
      const pathSvc = await child.getAsync(PathService);
      expect(await install.install('bun', '1.0.7')).toBeUndefined();
      await pathSvc.createVersionedToolPath('bun', '1.0.7');

      expect(await install.install('bun', '1.0.7')).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'bun' },
        'tool already linked',
      );
    });

    test('resets the link context after linking', async () => {
      const link = await child.getAsync(LinkToolService);

      expect(await install.install('bun', '1.2.1')).toBeUndefined();

      expect(link.context).toBeNull();
    });

    test('resets the link context when linking fails', async () => {
      const link = await child.getAsync(LinkToolService);
      vi.spyOn(BunInstallService.prototype, 'test').mockRejectedValueOnce(
        new Error('test failed'),
      );

      await expect(install.install('bun', '1.2.2')).rejects.toThrow(
        'test failed',
      );

      expect(link.context).toBeNull();
    });

    test('installs a recorded version again when its files are missing', async () => {
      const ver = await child.getAsync(VersionService);
      expect(await install.install('bun', '1.3.0')).toBeUndefined();
      const installSpy = vi.spyOn(BunInstallService.prototype, 'install');
      const linkSpy = vi.spyOn(BunInstallService.prototype, 'link');

      expect(await install.install('bun', '1.3.0')).toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith(
        { tool: 'bun', version: '1.3.0' },
        'tool version missing, installing',
      );
      expect(installSpy).toHaveBeenCalledExactlyOnceWith('1.3.0');
      // the current version is linked too, its wrappers are gone with the files
      expect(linkSpy).toHaveBeenCalledExactlyOnceWith('1.3.0');
      // the version is still recorded once
      expect(
        (await ver.findInstalled('bun')).filter((v) => v.version === '1.3.0'),
      ).toHaveLength(1);
    });

    test.each(['no-uninstall', 'shell-tool'])(
      'keeps a recorded version of %s, which has no files to check',
      async (tool) => {
        const installSpy = vi.spyOn(
          tool === 'shell-tool'
            ? ShellInstallService.prototype
            : NoUninstallInstallService.prototype,
          'install',
        );
        expect(await install.install(tool, '2.0.0')).toBeUndefined();
        installSpy.mockClear();

        expect(await install.install(tool, '2.0.0')).toBeUndefined();

        expect(logger.info).toHaveBeenCalledWith(
          { tool },
          'tool already installed',
        );
        expect(installSpy).not.toHaveBeenCalled();
      },
    );

    test('sets the link context of the version', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'setContext');
      vi.mocked(BunInstallService.prototype).versionDir.mockReturnValueOnce(
        '/opt/containerbase/tools/bun/1.2.0',
      );

      expect(await install.install('bun', '1.2.0')).toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith({
        tool: 'bun',
        version: '1.2.0',
        dir: '/opt/containerbase/tools/bun/1.2.0',
      });
    });

    test('aborts when the tool cannot be prepared', async () => {
      vi.mocked(BunInstallService.prototype).needsPrepare.mockReturnValueOnce(
        true,
      );
      vi.mocked(prepareTools).mockResolvedValueOnce(1);

      expect(await install.install('bun', '1.1.0')).toBe(1);
    });

    test('aborts when the tool cannot be initialized', async () => {
      vi.mocked(
        BunInstallService.prototype,
      ).needsInitialize.mockReturnValueOnce(true);
      vi.mocked(initializeTools).mockResolvedValueOnce(1);

      expect(await install.install('bun', '1.1.1')).toBe(1);
    });

    test('legacy tool', async () => {
      const ver = await child.getAsync(VersionService);

      expect(await install.install('leg', '1.0.0')).toBeUndefined();

      expect(await ver.getCurrent('leg')).toMatchObject({
        name: 'leg',
        tool: { name: 'leg', version: '1.0.0' },
      });
      // a second install keeps the recorded version
      expect(await install.install('leg', '1.0.0')).toBeUndefined();
    });

    test('legacy tool: dry run', async () => {
      expect(await install.install('leg', '2.0.0', true)).toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith(
        'Dry run: install tool leg v2.0.0 ...',
      );
    });

    test('unknown tool', async () => {
      expect(await install.install('not-exist', '1.0.0')).toBe(1);

      expect(logger.error).toHaveBeenCalledExactlyOnceWith(
        { tool: 'not-exist' },
        'tool not found',
      );
    });
  });

  describe('uninstall', () => {
    test('not installed', async () => {
      expect(await install.uninstall('bun', '9.9.9')).toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith(
        { tool: 'bun' },
        'tool not installed',
      );
    });

    test('fails if the tool cannot be uninstalled', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.addInstalled({ name: 'no-uninstall', version: '1.0.0' });

      expect(await install.uninstall('no-uninstall', '1.0.0')).toBe(
        NotSupported,
      );
      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'no-uninstall' },
        'tool cannot be uninstalled',
      );
    });

    test('fails if the tool needs root', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.addInstalled({ name: 'root-only', version: '1.0.0' });

      expect(await install.uninstall('root-only', '1.0.0')).toBe(NotRoot);
      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'root-only' },
        'tool must be uninstalled as root',
      );
    });

    test('dry run', async () => {
      expect(await install.install('bun', '3.0.0')).toBeUndefined();
      const ensure = vi.spyOn(PathService.prototype, 'ensureBasePaths');

      expect(await install.uninstall('bun', '3.0.0', true)).toBeUndefined();
      // a dry run doesn't create any folders
      expect(ensure).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Dry run: uninstall tool bun ...',
      );

      const ver = await child.getAsync(VersionService);
      expect(await ver.isInstalled({ name: 'bun', version: '3.0.0' })).toBe(
        true,
      );
    });

    test('removes the tool and its links', async () => {
      expect(await install.install('bun', '3.1.0')).toBeUndefined();

      expect(await install.uninstall('bun', '3.1.0')).toBeUndefined();

      const ver = await child.getAsync(VersionService);
      expect(await ver.isInstalled({ name: 'bun', version: '3.1.0' })).toBe(
        false,
      );
      expect(await ver.getCurrent('bun')).toBeNull();
    });

    test('all versions', async () => {
      expect(await install.install('bun', '4.0.0')).toBeUndefined();
      expect(await install.install('bun', '4.1.0')).toBeUndefined();

      expect(await install.uninstall('bun')).toBe(0);

      const ver = await child.getAsync(VersionService);
      expect(await ver.findInstalled('bun')).toEqual([]);
    });

    test('blocked by a child tool', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.addInstalled({ name: 'bun', version: '5.0.0' });
      await ver.addInstalled({
        name: 'bun-plugin',
        version: '1.0.0',
        parent: { name: 'bun', version: '5.0.0' },
      });

      expect(await install.uninstall('bun', '5.0.0')).toBe(BlockingChild);

      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ tool: 'bun', version: '5.0.0' }),
        'tool version has child dependencies and cannot be uninstalled',
      );
    });

    test('recursive', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.addInstalled({ name: 'bun', version: '6.0.0' });
      await ver.addInstalled({
        name: 'bun',
        version: '6.1.0',
        parent: { name: 'bun', version: '6.0.0' },
      });

      expect(
        await install.uninstall('bun', '6.0.0', false, true),
      ).toBeUndefined();

      expect(await ver.isInstalled({ name: 'bun', version: '6.0.0' })).toBe(
        false,
      );
    });

    test('all versions: skips duplicates and stops on the first failure', async () => {
      const ver = await child.getAsync(VersionService);
      // start from a clean slate, earlier tests left versions behind
      await ver.removeInstalled({ name: 'bun' });
      await ver.removeInstalled({ name: 'bun-plugin' });
      // the same version is recorded twice, once per parent
      await ver.addInstalled({ name: 'bun', version: '8.0.0' });
      await ver.addInstalled({
        name: 'bun',
        version: '8.0.0',
        parent: { name: 'node', version: '1.0.0' },
      });
      await ver.addInstalled({ name: 'bun', version: '8.1.0' });
      await ver.addInstalled({
        name: 'bun-plugin',
        version: '1.0.0',
        parent: { name: 'bun', version: '8.1.0' },
      });

      expect(await install.uninstall('bun')).toBe(BlockingChild);

      expect(logger.info).toHaveBeenCalledWith('Uninstalling bun@8.0.0...');
      expect(logger.info).toHaveBeenCalledWith('Uninstalling bun@8.1.0...');
    });

    test('recursive: stops when a child cannot be uninstalled', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.addInstalled({ name: 'bun', version: '9.0.0' });
      await ver.addInstalled({
        name: 'leg',
        version: '9.0.0',
        parent: { name: 'bun', version: '9.0.0' },
      });

      expect(await install.uninstall('bun', '9.0.0', false, true)).toBe(
        NotSupported,
      );
    });

    test('removes the recorded links', async () => {
      vi.spyOn(LinkToolService.prototype, 'links', 'get').mockReturnValue([
        'bun',
      ]);
      const ver = await child.getAsync(VersionService);
      expect(await install.install('bun', '11.0.0')).toBeUndefined();
      expect(
        await ver.findLinks({ name: 'bun', version: '11.0.0' }),
      ).toMatchObject([{ name: 'bun' }]);
      const spy = vi.spyOn(LinkToolService.prototype, 'rm');

      expect(await install.uninstall('bun', '11.0.0')).toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('bun');
      expect(await ver.findLinks({ name: 'bun', version: '11.0.0' })).toEqual(
        [],
      );
    });

    test('legacy tools cannot be uninstalled', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.addInstalled({ name: 'leg', version: '7.0.0' });

      expect(await install.uninstall('leg', '7.0.0')).toBe(NotSupported);

      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'leg', version: '7.0.0' },
        'legacy tools cannot be uninstalled',
      );
    });

    test('removes the shim and the pointer of the version', async () => {
      expect(await install.install('multi', '3.0.0')).toBeUndefined();
      expect(await install.install('multi', '4.0.0')).toBeUndefined();

      expect(await install.uninstall('multi', '3.0.0')).toBeUndefined();

      await expect(fs.lstat(binPath('multi3'))).rejects.toThrow();
      await expect(fs.lstat(linkPath('multi3'))).rejects.toThrow();
      // the commands of the other version stay
      expect(await pathExists(linkPath('multi4'), 'file')).toBe(true);
      expect(await pathExists(binPath('multi4'), 'file')).toBe(true);
    });
  });

  describe('links', () => {
    test('a command keeps the version which linked it last', async () => {
      const pathSvc = await child.getAsync(PathService);
      expect(await install.install('multi', '1.0.0')).toBeUndefined();
      expect(await install.install('multi', '2.0.0')).toBeUndefined();

      const wrapper = (version: string, name: string): string =>
        join(pathSvc.versionedToolPath('multi', version), '.wrappers', name);
      expect(await fs.readlink(linkPath('multi'))).toBe(
        wrapper('2.0.0', 'multi'),
      );
      expect(await fs.readlink(linkPath('multi1'))).toBe(
        wrapper('1.0.0', 'multi1'),
      );
      expect(await fs.readlink(linkPath('multi2'))).toBe(
        wrapper('2.0.0', 'multi2'),
      );
      expect(await fs.readFile(binPath('multi1'), 'utf8')).toContain(
        'ensure multi1',
      );
    });

    test('points the commands before the tool test', async () => {
      const point = vi.spyOn(LinkToolService.prototype, 'point');
      const test = vi.spyOn(MultiInstallService.prototype, 'test');

      expect(await install.install('multi', '1.1.0')).toBeUndefined();

      expect(point).toHaveBeenCalledTimes(2);
      expect(test).toHaveBeenCalledOnce();
      expect(point.mock.invocationCallOrder.at(-1)).toBeLessThan(
        test.mock.invocationCallOrder[0]!,
      );
    });

    test('a linked child tool is installed per parent version', async () => {
      const pathSvc = await child.getAsync(PathService);
      expect(await install.install('multi', '1.2.0')).toBeUndefined();

      expect(await install.install('child', '1.0.0')).toBeUndefined();

      expect(await fs.readlink(linkPath('child'))).toBe(
        join(
          pathSvc.versionedToolPath('child', '1.0.0'),
          '1.2.0',
          '.wrappers/child',
        ),
      );
    });
  });

  describe('ensure', () => {
    /** Removes the folder of an installed version. */
    async function removeVersion(
      tool: string,
      version: string,
      ...sub: string[]
    ): Promise<void> {
      const pathSvc = await child.getAsync(PathService);
      await fs.rm(join(pathSvc.versionedToolPath(tool, version), ...sub), {
        recursive: true,
      });
    }

    test('fails for an unknown command', async () => {
      expect(await install.ensure('nope')).toBe(CommandNotFound);

      expect(logger.error).toHaveBeenCalledExactlyOnceWith(
        { command: 'nope' },
        'command not installed, run install-tool <tool> <version>',
      );
    });

    test('recreates only a missing pointer', async () => {
      expect(await install.install('multi', '5.0.0')).toBeUndefined();
      await fs.rm(linkPath('multi5'));
      const spy = vi.spyOn(MultiInstallService.prototype, 'install');

      expect(await install.ensure('multi5')).toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
      expect(await pathExists(linkPath('multi5'), 'file')).toBe(true);
    });

    test('installs a missing version again without changing any command', async () => {
      const ver = await child.getAsync(VersionService);
      expect(await install.install('multi', '7.0.0')).toBeUndefined();
      expect(await install.install('multi', '8.0.0')).toBeUndefined();
      const shim = await fs.readFile(binPath('multi7'), 'utf8');
      const current = await fs.readlink(linkPath('multi'));
      await removeVersion('multi', '7.0.0');
      expect(await pathExists(linkPath('multi7'), 'file')).toBe(false);
      const test = vi.spyOn(MultiInstallService.prototype, 'test');

      expect(await install.ensure('multi7')).toBeUndefined();

      expect(await pathExists(linkPath('multi7'), 'file')).toBe(true);
      // nothing else points elsewhere or is tested
      expect(await fs.readlink(linkPath('multi'))).toBe(current);
      expect(await fs.readFile(binPath('multi7'), 'utf8')).toBe(shim);
      expect(await ver.getCurrent('multi')).toMatchObject({
        tool: { name: 'multi', version: '8.0.0' },
      });
      expect(await ver.findLink('multi')).toMatchObject({
        tool: { name: 'multi', version: '8.0.0' },
      });
      expect(
        (await ver.findInstalled('multi')).filter((v) => v.version === '7.0.0'),
      ).toHaveLength(1);
      expect(test).not.toHaveBeenCalled();
    });

    test('only evicts the download cache after it installed a version again', async () => {
      expect(await install.install('multi', '18.0.0')).toBeUndefined();
      await removeVersion('multi', '18.0.0');
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);
      const evict = vi.spyOn(CacheService.prototype, 'evict');
      vi.mocked(logger.debug).mockClear();

      expect(await install.ensure('multi18')).toBeUndefined();

      expect(evict).toHaveBeenCalledExactlyOnceWith(false);
      expect(logger.debug).not.toHaveBeenCalledWith('cleaning apt caches');
      expect(logger.debug).not.toHaveBeenCalledWith('cleaning tmp files');
      expect(logger.debug).not.toHaveBeenCalledWith('cleaning root caches');
      expect(logger.debug).not.toHaveBeenCalledWith('cleaning user caches');
    });

    test('evicts the download cache when installing a version again fails', async () => {
      expect(await install.install('multi', '19.0.0')).toBeUndefined();
      await removeVersion('multi', '19.0.0');
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(MultiInstallService.prototype, 'install').mockRejectedValueOnce(
        new Error('install failed'),
      );
      const evict = vi.spyOn(CacheService.prototype, 'evict');
      vi.mocked(logger.debug).mockClear();

      await expect(install.ensure('multi19')).rejects.toThrow('install failed');

      expect(evict).toHaveBeenCalledExactlyOnceWith(false);
      expect(logger.debug).not.toHaveBeenCalledWith('cleaning tmp files');
    });

    test('a failing eviction does not fail the restore', async () => {
      expect(await install.install('multi', '21.0.0')).toBeUndefined();
      await removeVersion('multi', '21.0.0');
      const err = new Error('evict failed');
      vi.spyOn(CacheService.prototype, 'evict').mockRejectedValueOnce(err);

      expect(await install.ensure('multi21')).toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        { err },
        'cannot evict the download cache',
      );
    });

    test('does not evict the cache when it only recreates a pointer', async () => {
      expect(await install.install('multi', '20.0.0')).toBeUndefined();
      await fs.rm(linkPath('multi20'));
      const evict = vi.spyOn(CacheService.prototype, 'evict');

      expect(await install.ensure('multi20')).toBeUndefined();

      expect(evict).not.toHaveBeenCalled();
    });

    test('initializes the tool before it installs the version again', async () => {
      expect(await install.install('multi', '15.0.0')).toBeUndefined();
      await removeVersion('multi', '15.0.0');
      vi.mocked(initializeTools).mockClear();
      const spy = vi.spyOn(MultiInstallService.prototype, 'install');

      expect(await install.ensure('multi15')).toBeUndefined();

      expect(initializeTools).toHaveBeenCalledExactlyOnceWith(['multi']);
      expect(
        vi.mocked(initializeTools).mock.invocationCallOrder[0],
      ).toBeLessThan(spy.mock.invocationCallOrder[0]!);
    });

    test('keeps the version missing when the tool cannot be initialized', async () => {
      expect(await install.install('multi', '16.0.0')).toBeUndefined();
      await removeVersion('multi', '16.0.0');
      vi.mocked(initializeTools).mockResolvedValueOnce(1);
      const spy = vi.spyOn(MultiInstallService.prototype, 'install');

      expect(await install.ensure('multi16')).toBe(1);

      expect(spy).not.toHaveBeenCalled();
    });

    test('does not initialize a tool which is initialized', async () => {
      expect(await install.install('multi', '17.0.0')).toBeUndefined();
      await removeVersion('multi', '17.0.0');
      vi.spyOn(
        MultiInstallService.prototype,
        'isInitialized',
      ).mockResolvedValue(true);
      vi.mocked(initializeTools).mockClear();

      expect(await install.ensure('multi17')).toBeUndefined();

      expect(initializeTools).not.toHaveBeenCalled();
    });

    test('installs the missing parent first', async () => {
      expect(await install.install('multi', '9.0.0')).toBeUndefined();
      expect(await install.install('child', '3.0.0')).toBeUndefined();
      await removeVersion('child', '3.0.0');
      await removeVersion('multi', '9.0.0');
      const multi = vi.spyOn(MultiInstallService.prototype, 'install');
      const childSvc = vi.spyOn(ChildInstallService.prototype, 'install');

      expect(await install.ensure('child')).toBeUndefined();

      expect(multi).toHaveBeenCalledExactlyOnceWith('9.0.0');
      expect(childSvc).toHaveBeenCalledExactlyOnceWith('3.0.0');
      expect(multi.mock.invocationCallOrder[0]).toBeLessThan(
        childSvc.mock.invocationCallOrder[0]!,
      );
      expect(await pathExists(linkPath('child'), 'file')).toBe(true);
      expect(await pathExists(linkPath('multi9'), 'file')).toBe(true);
    });

    test('points a child at the wrapper for the current parent', async () => {
      const pathSvc = await child.getAsync(PathService);
      expect(await install.install('multi', '10.0.0')).toBeUndefined();
      expect(await install.install('child', '4.0.0')).toBeUndefined();
      expect(await install.install('multi', '11.0.0')).toBeUndefined();
      await removeVersion('child', '4.0.0', '10.0.0');
      expect(await pathExists(linkPath('child'), 'file')).toBe(false);

      expect(await install.ensure('child')).toBeUndefined();

      expect(await fs.readlink(linkPath('child'))).toBe(
        join(
          pathSvc.versionedToolPath('child', '4.0.0'),
          '11.0.0',
          '.wrappers/child',
        ),
      );
    });

    test('records a child for the current parent it was installed under', async () => {
      const ver = await child.getAsync(VersionService);
      expect(await install.install('multi', '22.0.0')).toBeUndefined();
      expect(await install.install('child', '5.0.0')).toBeUndefined();
      expect(await install.install('multi', '23.0.0')).toBeUndefined();
      await removeVersion('child', '5.0.0', '22.0.0');
      expect(await ver.getChilds({ name: 'multi', version: '23.0.0' })).toEqual(
        [],
      );

      expect(await install.ensure('child')).toBeUndefined();

      expect(
        await ver.getChilds({ name: 'multi', version: '23.0.0' }),
      ).toMatchObject([{ name: 'child', version: '5.0.0' }]);
      // the record for the old parent stays
      expect(
        await ver.getChilds({ name: 'multi', version: '22.0.0' }),
      ).toMatchObject([{ name: 'child', version: '5.0.0' }]);
      // the current versions are not changed
      expect(await ver.getCurrent('multi')).toMatchObject({
        tool: { name: 'multi', version: '23.0.0' },
      });

      // a version which is recorded for the parent already is not recorded again
      await removeVersion('child', '5.0.0', '23.0.0');
      await fs.rm(linkPath('child'));
      const add = vi.spyOn(VersionService.prototype, 'addInstalled');

      expect(await install.ensure('child')).toBeUndefined();

      expect(add).not.toHaveBeenCalled();
      expect(
        await ver.getChilds({ name: 'multi', version: '23.0.0' }),
      ).toHaveLength(1);
    });

    test('removes the partial version folder when the install fails', async () => {
      const ver = await child.getAsync(VersionService);
      const pathSvc = await child.getAsync(PathService);
      expect(await install.install('multi', '12.0.0')).toBeUndefined();
      expect(await install.install('multi', '13.0.0')).toBeUndefined();
      await removeVersion('multi', '12.0.0');
      vi.spyOn(MultiInstallService.prototype, 'install').mockImplementationOnce(
        async function (this: MultiInstallService, version: string) {
          await pathSvc.createVersionedToolPath('multi', version);
          throw new Error('install failed');
        },
      );

      await expect(install.ensure('multi12')).rejects.toThrow('install failed');

      expect(await pathSvc.findVersionedToolPath('multi', '12.0.0')).toBeNull();
      // the next call tries again
      expect(await ver.findLink('multi12')).not.toBeNull();
      expect(await install.ensure('multi12')).toBeUndefined();
      expect(await pathExists(linkPath('multi12'), 'file')).toBe(true);
    });

    test('keeps the files when only linking fails', async () => {
      const pathSvc = await child.getAsync(PathService);
      expect(await install.install('multi', '14.0.0')).toBeUndefined();
      await fs.rm(linkPath('multi14'));
      await fs.rm(
        join(pathSvc.versionedToolPath('multi', '14.0.0'), '.wrappers'),
        { recursive: true },
      );
      vi.spyOn(MultiInstallService.prototype, 'link').mockRejectedValueOnce(
        new Error('link failed'),
      );

      await expect(install.ensure('multi14')).rejects.toThrow('link failed');

      expect(
        await pathSvc.findVersionedToolPath('multi', '14.0.0'),
      ).not.toBeNull();
    });

    test('fails for a tool without an install service', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.setLink({
        name: 'unknown-cmd',
        tool: { name: 'unknown', version: '1.0.0' },
      });
      await ver.setLink({
        name: 'shell-cmd',
        tool: { name: 'shell-tool', version: '1.0.0' },
      });

      expect(await install.ensure('unknown-cmd')).toBe(NotSupported);
      expect(await install.ensure('shell-cmd')).toBe(NotSupported);

      expect(logger.error).toHaveBeenCalledWith(
        { command: 'shell-cmd', tool: 'shell-tool' },
        'tool cannot be installed again',
      );
    });

    test('fails for a tool which needs root', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.setLink({
        name: 'root-cmd',
        tool: { name: 'root-only', version: '1.0.0' },
      });

      expect(await install.ensure('root-cmd')).toBe(NotRoot);

      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'root-only' },
        'tool must be installed as root',
      );
    });

    test('fails without the current parent', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.setLink({
        name: 'orphan-cmd',
        tool: { name: 'orphan', version: '1.0.0' },
      });

      expect(await install.ensure('orphan-cmd')).toBe(MissingParent);

      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'orphan', parent: 'ghost' },
        'parent tool not installed',
      );
    });

    test('installs for a parent without an install service', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.setLink({
        name: 'orphan-cmd',
        tool: { name: 'orphan', version: '1.0.0' },
      });
      await ver.setCurrent({
        name: 'ghost',
        tool: { name: 'ghost', version: '1.0.0' },
      });
      const pathSvc = await child.getAsync(PathService);
      const spy = vi.spyOn(OrphanInstallService.prototype, 'install');

      expect(await install.ensure('orphan-cmd')).toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('1.0.0');
      const wrapper = join(
        pathSvc.versionedToolPath('orphan', '1.0.0'),
        '.wrappers/orphan-cmd',
      );
      expect(await pathExists(wrapper, 'file')).toBe(true);
      expect(await fs.readlink(linkPath('orphan-cmd'))).toBe(wrapper);
      expect(await fs.realpath(linkPath('orphan-cmd'))).toBe(
        await fs.realpath(wrapper),
      );
    });

    test('fails when the parent cannot be installed again', async () => {
      const ver = await child.getAsync(VersionService);
      await ver.setLink({
        name: 'stuck-cmd',
        tool: { name: 'stuck', version: '1.0.0' },
      });
      await ver.setCurrent({
        name: 'root-only',
        tool: { name: 'root-only', version: '1.0.0' },
      });

      expect(await install.ensure('stuck-cmd')).toBe(NotRoot);
    });
  });
});
