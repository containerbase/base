import fs from 'node:fs/promises';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { initializeTools, prepareTools } from '../prepare-tool/index.ts';
import {
  CacheService,
  EnvService,
  LinkToolService,
  PathService,
  SnapshotService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { BunInstallService } from '../tools/bun.ts';
import { BlockingChild, NotRoot, NotSupported } from '../utils/codes.ts';
import { isDockerBuild, logger, pathExists } from '../utils/index.ts';
import { BaseInstallService } from './base-install.service.ts';
import { V1ToolInstallService } from './install-legacy-tool.service.ts';
import {
  INSTALL_TOOL_TOKEN,
  InstallToolService,
} from './install-tool.service.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

vi.mock('del');
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

describe('cli/install-tool/install-tool.service', () => {
  const parent = createContainer();
  parent.bind(InstallToolService).toSelf();
  parent.bind(V1ToolInstallService).toSelf();
  parent.bind(INSTALL_TOOL_TOKEN).to(BunInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(RootOnlyInstallService);
  parent.bind(INSTALL_TOOL_TOKEN).to(NoUninstallInstallService);

  let child: Container;
  let install: InstallToolService;
  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/bin',
      'opt/containerbase/data',
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
      // the install updates the snapshot itself
      expect(prepareTools).toHaveBeenCalledExactlyOnceWith(
        ['bun'],
        false,
        false,
      );
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

    test('cleans the caches on a docker build', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);

      expect(await install.install('bun', '1.0.4')).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith('cleaning tmp files');
      expect(logger.debug).toHaveBeenCalledWith('cleaning user caches');
    });

    test('cleans the root caches when running as root', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);

      expect(await install.install('bun', '1.0.5')).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith('cleaning apt caches');
      expect(logger.debug).toHaveBeenCalledWith('cleaning root caches');
    });

    test('snapshots a build-time install', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const tool = vi.spyOn(BunInstallService.prototype, 'snapshot');
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.install('bun', '1.2.0')).toBeUndefined();

      expect(tool).toHaveBeenCalledExactlyOnceWith('1.2.0');
      expect(files).toHaveBeenCalledOnce();
      expect(
        await pathExists(
          rootPath('var/lib/containerbase/opt/data/containerbase.db'),
          'file',
        ),
      ).toBe(true);
    });

    test('moves a still real folder of an installed version', async () => {
      expect(await install.install('bun', '1.2.1')).toBeUndefined();
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const tool = vi.spyOn(BunInstallService.prototype, 'snapshot');
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.install('bun', '1.2.1')).toBeUndefined();

      expect(tool).toHaveBeenCalledExactlyOnceWith('1.2.1');
      expect(files).toHaveBeenCalledOnce();
    });

    test('snapshots only the files for a v1 tool', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const move = vi.spyOn(SnapshotService.prototype, 'moveAndLink');
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.install('leg', '1.2.0')).toBeUndefined();

      expect(move).not.toHaveBeenCalled();
      expect(files).toHaveBeenCalledOnce();
    });

    test('skips the snapshot for a dry run', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.install('bun', '1.2.6', true)).toBeUndefined();

      expect(files).not.toHaveBeenCalled();
    });

    test('updates the snapshot after a failed install', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(BunInstallService.prototype, 'install').mockRejectedValueOnce(
        new Error('install failed'),
      );
      const tool = vi.spyOn(BunInstallService.prototype, 'snapshot');
      const remove = vi.spyOn(BunInstallService.prototype, 'removeSnapshot');
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      await expect(install.install('bun', '1.2.2')).rejects.toThrow(
        'install failed',
      );

      expect(remove).toHaveBeenCalledExactlyOnceWith('1.2.2');
      expect(tool).not.toHaveBeenCalled();
      expect(files).toHaveBeenCalledOnce();
    });

    test('keeps the install error when the snapshot fails', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(BunInstallService.prototype, 'install').mockRejectedValueOnce(
        new Error('install failed'),
      );
      const removeErr = new Error('remove failed');
      vi.spyOn(
        BunInstallService.prototype,
        'removeSnapshot',
      ).mockRejectedValueOnce(removeErr);
      const filesErr = new Error('snapshot failed');
      vi.spyOn(
        SnapshotService.prototype,
        'snapshotFiles',
      ).mockRejectedValueOnce(filesErr);

      await expect(install.install('bun', '1.2.7')).rejects.toThrow(
        'install failed',
      );

      expect(logger.warn).toHaveBeenCalledWith(
        { err: removeErr, tool: 'bun', version: '1.2.7' },
        'could not remove the snapshot',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { err: filesErr, tool: 'bun', version: '1.2.7' },
        'could not update the snapshot',
      );
    });

    test('keeps the snapshot of a failed v1 install', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(V1ToolInstallService.prototype, 'execute').mockRejectedValueOnce(
        new Error('install failed'),
      );
      const remove = vi.spyOn(SnapshotService.prototype, 'remove');

      await expect(install.install('leg', '1.2.1')).rejects.toThrow(
        'install failed',
      );

      expect(remove).not.toHaveBeenCalled();
    });

    test('keeps the snapshot copy of a failed runtime install', async () => {
      vi.spyOn(BunInstallService.prototype, 'install').mockRejectedValueOnce(
        new Error('install failed'),
      );
      const remove = vi.spyOn(BunInstallService.prototype, 'removeSnapshot');

      await expect(install.install('bun', '1.2.4')).rejects.toThrow(
        'install failed',
      );

      expect(remove).not.toHaveBeenCalled();
    });

    test('cleans the caches when the snapshot fails', async () => {
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(
        SnapshotService.prototype,
        'snapshotFiles',
      ).mockRejectedValueOnce(new Error('snapshot failed'));

      await expect(install.install('bun', '1.2.5')).rejects.toThrow(
        'snapshot failed',
      );

      expect(logger.debug).toHaveBeenCalledWith('cleaning tmp files');
    });

    test('skips the snapshot outside of an image build', async () => {
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.install('bun', '1.2.3')).toBeUndefined();

      expect(files).not.toHaveBeenCalled();
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
      expect(await install.install('bun', '1.0.7')).toBeUndefined();

      expect(await install.install('bun', '1.0.7')).toBeUndefined();

      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'bun' },
        'tool already linked',
      );
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

    test('removes the snapshot copy at image build time', async () => {
      expect(await install.install('bun', '3.2.0')).toBeUndefined();
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const remove = vi.spyOn(BunInstallService.prototype, 'removeSnapshot');
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.uninstall('bun', '3.2.0')).toBeUndefined();

      expect(remove).toHaveBeenCalledExactlyOnceWith('3.2.0');
      expect(files).toHaveBeenCalledOnce();
    });

    test('keeps the snapshot outside of an image build', async () => {
      expect(await install.install('bun', '3.3.0')).toBeUndefined();
      const remove = vi.spyOn(BunInstallService.prototype, 'removeSnapshot');
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.uninstall('bun', '3.3.0')).toBeUndefined();

      expect(remove).not.toHaveBeenCalled();
      expect(files).not.toHaveBeenCalled();
    });

    test('updates the snapshot after a failed uninstall', async () => {
      expect(await install.install('bun', '3.5.0')).toBeUndefined();
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(BunInstallService.prototype, 'uninstall').mockRejectedValueOnce(
        new Error('uninstall failed'),
      );
      const filesErr = new Error('snapshot failed');
      const files = vi
        .spyOn(SnapshotService.prototype, 'snapshotFiles')
        .mockRejectedValueOnce(filesErr);

      await expect(install.uninstall('bun', '3.5.0')).rejects.toThrow(
        'uninstall failed',
      );

      expect(files).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        { err: filesErr, tool: 'bun' },
        'could not update the snapshot',
      );
    });

    test('fails when the snapshot of an uninstall fails', async () => {
      expect(await install.install('bun', '3.6.0')).toBeUndefined();
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      vi.spyOn(
        SnapshotService.prototype,
        'snapshotFiles',
      ).mockRejectedValueOnce(new Error('snapshot failed'));

      await expect(install.uninstall('bun', '3.6.0')).rejects.toThrow(
        'snapshot failed',
      );
    });

    test('dry run keeps the snapshot at image build time', async () => {
      expect(await install.install('bun', '3.4.0')).toBeUndefined();
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.uninstall('bun', '3.4.0', true)).toBeUndefined();

      expect(files).not.toHaveBeenCalled();
    });

    test('all versions', async () => {
      expect(await install.install('bun', '4.0.0')).toBeUndefined();
      expect(await install.install('bun', '4.1.0')).toBeUndefined();
      vi.mocked(isDockerBuild).mockResolvedValue(true);
      const remove = vi.spyOn(BunInstallService.prototype, 'removeSnapshot');
      const files = vi.spyOn(SnapshotService.prototype, 'snapshotFiles');

      expect(await install.uninstall('bun')).toBe(0);

      const ver = await child.getAsync(VersionService);
      expect(await ver.findInstalled('bun')).toEqual([]);
      // the copies of all versions are removed, the files updated once
      expect(remove).toHaveBeenCalledWith('4.0.0');
      expect(remove).toHaveBeenCalledWith('4.1.0');
      expect(files).toHaveBeenCalledOnce();
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
  });
});
