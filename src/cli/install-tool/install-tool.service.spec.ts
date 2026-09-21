import fs from 'node:fs/promises';
import type { Container } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { initializeTools, prepareTools } from '../prepare-tool/index.ts';
import {
  EnvService,
  LinkToolService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { BunInstallService } from '../tools/bun.ts';
import { BlockingChild, NotSupported } from '../utils/codes.ts';
import { isDockerBuild, logger } from '../utils/index.ts';
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

describe('cli/install-tool/install-tool.service', () => {
  const parent = createContainer();
  parent.bind(InstallToolService).toSelf();
  parent.bind(V1ToolInstallService).toSelf();
  parent.bind(INSTALL_TOOL_TOKEN).to(BunInstallService);

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
      const bun = await child.getAsync<BunInstallService>(INSTALL_TOOL_TOKEN);
      vi.mocked(bun).needsInitialize.mockResolvedValueOnce(true);
      vi.mocked(bun).needsPrepare.mockResolvedValueOnce(true);
      expect(await install.install('bun', '1.0.0')).toBeUndefined();
      expect(await ver.getCurrent('bun')).toMatchObject({
        name: 'bun',
        tool: { name: 'bun', version: '1.0.0' },
      });
    });

    test('writes version even if tool is installed', async () => {
      const ver = await child.getAsync(VersionService);
      const bun = await child.getAsync<BunInstallService>(INSTALL_TOOL_TOKEN);
      vi.mocked(bun).isInstalled.mockResolvedValueOnce(true);
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
      const bun = await child.getAsync<BunInstallService>(INSTALL_TOOL_TOKEN);
      vi.mocked(bun).needsPrepare.mockReturnValueOnce(true);
      vi.mocked(prepareTools).mockResolvedValueOnce(1);

      expect(await install.install('bun', '1.1.0')).toBe(1);
    });

    test('aborts when the tool cannot be initialized', async () => {
      const bun = await child.getAsync<BunInstallService>(INSTALL_TOOL_TOKEN);
      vi.mocked(bun).needsInitialize.mockReturnValueOnce(true);
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

    test('dry run', async () => {
      expect(await install.install('bun', '3.0.0')).toBeUndefined();

      expect(await install.uninstall('bun', '3.0.0', true)).toBeUndefined();
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
  });
});
