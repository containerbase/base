import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { ensurePaths, rootPath } from '../../../test/path';
import { VersionService, createContainer } from '../services';
import { NpmVersionResolver } from '../tools/node/resolver';
import { NpmBaseInstallService } from '../tools/node/utils';
import { PipVersionResolver } from '../tools/python/pip';
import { PipBaseInstallService } from '../tools/python/utils';
import {
  RubyBaseInstallService,
  RubyGemVersionResolver,
} from '../tools/ruby/utils';
import { isDockerBuild, logger } from '../utils';
import {
  BlockingChild,
  CurrentVersion,
  MissingParent,
  NotSupported,
} from '../utils/codes';
import { installTool, linkTool, resolveVersion, uninstallTool } from '.';

vi.mock('del');
vi.mock('nano-spawn');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');
vi.mock('../utils', async (importActual) => ({
  ...(await importActual<typeof import('../utils')>()),
  isDockerBuild: vi.fn(),
}));

describe('cli/install-tool/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools/v2',
      'var/lib/containerbase/tool.prep.d',
    ]);

    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/dummy.sh'),
      '',
    );

    await fs.writeFile(rootPath('usr/local/containerbase/tools/leg.sh'), '');

    const verSvc = await createContainer().getAsync(VersionService);

    await verSvc.addInstalled({ name: 'node', version: '1.0.0' });
    await verSvc.addInstalled({ name: 'python', version: '1.0.0' });
    await verSvc.addInstalled({ name: 'ruby', version: '1.0.0' });

    await verSvc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: '1.0.0' },
    });
    await verSvc.setCurrent({
      name: 'python',
      tool: { name: 'python', version: '1.0.0' },
    });
    await verSvc.setCurrent({
      name: 'ruby',
      tool: { name: 'ruby', version: '1.0.0' },
    });

    await verSvc.addInstalled({ name: 'node', version: '1.0.1' });
    await verSvc.addInstalled({
      name: 'pnpm',
      version: '1.0.0',
      parent: { name: 'node', version: '1.0.1' },
    });
  });

  describe('installTool', () => {
    test('fails if parent is missing', async () => {
      vi.mocked(isDockerBuild).mockResolvedValueOnce(true);
      expect(await installTool('gradle', '1.0.0')).toBe(MissingParent);
      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'gradle', parent: 'java' },
        'parent tool not installed',
      );
    });

    test('works', async () => {
      expect(await installTool('bun', '1.0.0')).toBeUndefined();
      expect(await installTool('dummy', '1.0.0')).toBeUndefined();
      expect(await installTool('dummy', '1.0.0')).toBeUndefined();
      expect(await installTool('leg', '1.0.0', true)).toBeUndefined();
      expect(await installTool('leg', '1.0.0')).toBeUndefined();
      expect(await installTool('a', '1.0.0')).toBe(1);
    });

    test.each([
      {
        type: 'gem' as const,
        svc: RubyBaseInstallService,
      },
      {
        type: 'npm' as const,
        svc: NpmBaseInstallService,
      },
      {
        type: 'pip' as const,
        svc: PipBaseInstallService,
      },
    ])('works: $type', async ({ type, svc }) => {
      vi.spyOn(svc.prototype, 'install').mockResolvedValue();
      vi.spyOn(svc.prototype, 'needsInitialize').mockReturnValue(false);
      vi.spyOn(svc.prototype, 'validate').mockResolvedValue(true);
      vi.spyOn(svc.prototype, 'postInstall').mockResolvedValue();
      vi.spyOn(svc.prototype, 'test').mockRejectedValue(new Error('test'));
      expect(
        await installTool(`dummy-${type}`, '1.0.0', false, type),
      ).toBeUndefined();
    });
  });

  describe('resolveVersion', () => {
    test('works', async () => {
      expect(await resolveVersion('composer', '1.0.0')).toBe('1.0.0');
    });

    test.each([
      {
        type: 'gem' as const,
        svc: RubyGemVersionResolver,
      },
      {
        type: 'npm' as const,
        svc: NpmVersionResolver,
      },
      {
        type: 'pip' as const,
        svc: PipVersionResolver,
      },
    ])('works: $type', async ({ type, svc }) => {
      vi.spyOn(svc.prototype, 'resolve').mockResolvedValue('1.0.0');
      expect(await resolveVersion('dummy', '1.0.0', type)).toBe('1.0.0');
    });
  });

  test('linkTool', async () => {
    const spy = vi.spyOn(fs, 'writeFile');
    expect(await linkTool('node', { srcDir: '/bin/bash' })).toBeUndefined();
    expect(spy).toHaveBeenCalledOnce();
  });

  describe('uninstallTool', () => {
    test('works', async () => {
      // not installed
      expect(await uninstallTool('bun', '2.0.0')).toBeUndefined();
      // legacy not supported
      expect(await uninstallTool('leg', '1.0.0')).toBe(NotSupported);
      // linked tool uninstall not supported
      expect(await installTool('bun', '2.0.0')).toBeUndefined();
      expect(await uninstallTool('bun', '2.0.0')).toBe(CurrentVersion);

      // can uninstall old version
      expect(await installTool('bun', '2.0.1')).toBeUndefined();
      expect(await uninstallTool('bun', '2.0.0', true)).toBeUndefined();
      expect(await uninstallTool('bun', '2.0.0')).toBeUndefined();

      // cannot uninstall if has childs
      expect(await uninstallTool('node', '1.0.1')).toBe(BlockingChild);
    });

    test.each([
      { type: 'gem' as const },
      { type: 'npm' as const },
      { type: 'pip' as const },
    ])('works: $type', async ({ type }) => {
      expect(
        await uninstallTool(`dummy-${type}`, '2.0.0', false, type),
      ).toBeUndefined();
    });
  });
});
