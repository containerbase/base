import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  IpcServer,
  PathService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { NpmVersionResolver } from '../tools/node/resolver.ts';
import { NpmBaseInstallService } from '../tools/node/utils.ts';
import { PipVersionResolver } from '../tools/python/pip.ts';
import { PipBaseInstallService } from '../tools/python/utils.ts';
import { RubyInstallService } from '../tools/ruby/index.ts';
import {
  RubyBaseInstallService,
  RubyGemVersionResolver,
} from '../tools/ruby/utils.ts';
import { BlockingChild, MissingParent, NotSupported } from '../utils/codes.ts';
import { isDockerBuild, logger, pathExists } from '../utils/index.ts';
import {
  installTool,
  linkTool,
  listSupportedTools,
  resolveVersion,
  uninstallTool,
} from './index.ts';
import { V2ToolInstallService } from './install-legacy-tool.service.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun.ts');
vi.mock('../tools/php/composer.ts');
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
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

    test('prefers a modern service over a v2 shell tool with the same name', async () => {
      const script = rootPath('usr/local/containerbase/tools/v2/ruby.sh');
      await fs.writeFile(script, '');
      const proto = RubyInstallService.prototype;
      vi.spyOn(proto, 'needsPrepare').mockReturnValue(false);
      vi.spyOn(proto, 'needsInitialize').mockReturnValue(false);
      vi.spyOn(proto, 'validate').mockResolvedValue(true);
      vi.spyOn(proto, 'link').mockResolvedValue();
      vi.spyOn(proto, 'postInstall').mockResolvedValue();
      vi.spyOn(proto, 'test').mockResolvedValue();
      const ruby = vi.spyOn(proto, 'install').mockResolvedValue();
      const v2 = vi.spyOn(V2ToolInstallService.prototype, 'install');

      try {
        expect(await installTool('ruby', '3.4.11')).toBeUndefined();
      } finally {
        await fs.rm(script);
      }

      expect(ruby).toHaveBeenCalledExactlyOnceWith('3.4.11');
      expect(v2).not.toHaveBeenCalled();
    });

    test('rethrows a failing test for a known pip tool', async () => {
      // unlike the `dummy-*` tools above, `poetry` is in the `ResolverMap`, so
      // its `--version` flag is expected to work
      vi.spyOn(PipBaseInstallService.prototype, 'install').mockResolvedValue();
      vi.spyOn(
        PipBaseInstallService.prototype,
        'needsInitialize',
      ).mockReturnValue(false);
      vi.spyOn(PipBaseInstallService.prototype, 'validate').mockResolvedValue(
        true,
      );
      vi.spyOn(
        PipBaseInstallService.prototype,
        'postInstall',
      ).mockResolvedValue();
      vi.spyOn(PipBaseInstallService.prototype, 'test').mockRejectedValue(
        new Error('no --version flag'),
      );

      await expect(
        installTool('poetry', '1.0.0', false, 'pip'),
      ).rejects.toThrow('no --version flag');
    });
  });

  describe('listSupportedTools', () => {
    test('works', async () => {
      const tools = await listSupportedTools();
      const names = tools.map((t) => t.name);

      expect(names).toEqual(
        [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      );
      // v2 shell tools are supported
      expect(names).toContain('dummy');
      // v1 shell tools have no install service to describe
      expect(names).not.toContain('leg');

      expect(tools).toEqual(
        expect.arrayContaining([
          { name: 'apko' },
          { name: 'git', root: true },
          { name: 'git-lfs', parent: 'git' },
          { name: 'maven', parent: 'java' },
          { name: 'kas', type: 'pip', parent: 'python' },
          { name: 'bower', type: 'npm', parent: 'node', deprecated: true },
        ]),
      );
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

  describe('linkTool', () => {
    test('without ipc server', async () => {
      const spy = vi.spyOn(fs, 'writeFile');
      expect(await linkTool('node', { srcDir: '/bin/bash' })).toBe(0);
      expect(spy).toHaveBeenCalledOnce();
      expect(logger.debug).toHaveBeenCalledWith(
        'ipc server not running, linking tool directly',
      );
      expect(await pathExists(rootPath('tmp/containerbase/ipc.sock'))).toBe(
        false,
      );
    });

    test('fails when the folders are not writable', async () => {
      const pathSvc = await createContainer().getAsync(PathService);
      vi.spyOn(fs, 'access').mockImplementation((path) =>
        path === pathSvc.binDir
          ? Promise.reject(Object.assign(new Error('EROFS'), { code: 'EROFS' }))
          : Promise.resolve(),
      );
      const spy = vi.spyOn(fs, 'writeFile');

      await expect(linkTool('node', { srcDir: '/bin/bash' })).rejects.toThrow(
        `Can't write to ${pathSvc.binDir}, the file system is read-only. Install tools at image build time or mount the containerbase folders writable.`,
      );

      expect(spy).not.toHaveBeenCalled();
    });

    test('with ipc server', async () => {
      const svr = await createContainer().getAsync(IpcServer);
      await svr.start();
      expect(await pathExists(rootPath('tmp/containerbase/ipc.sock'))).toBe(
        true,
      );
      try {
        const spy = vi.spyOn(fs, 'writeFile');
        expect(await linkTool('node', { srcDir: '/bin/bash' })).toBe(0);
        expect(spy).toHaveBeenCalledOnce();
        expect(logger.debug).toHaveBeenCalledWith(
          'ipc server found, linking tool via ipc',
        );
      } finally {
        svr.stop();
      }
      expect(await pathExists(rootPath('tmp/containerbase/ipc.sock'))).toBe(
        false,
      );
    });
  });

  describe('uninstallTool', () => {
    test('works', async () => {
      // not installed
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0' }),
      ).toBeUndefined();
      // legacy not supported
      expect(await uninstallTool({ tool: 'leg', version: '1.0.0' })).toBe(
        NotSupported,
      );
      // linked tool uninstall supported
      expect(await installTool('bun', '2.0.0')).toBeUndefined();
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0' }),
      ).toBeUndefined();

      // can uninstall old version
      expect(await installTool('bun', '2.0.1')).toBeUndefined();
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0', dryRun: true }),
      ).toBeUndefined();
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0' }),
      ).toBeUndefined();

      // cannot uninstall if has childs
      expect(await uninstallTool({ tool: 'node', version: '1.0.1' })).toBe(
        BlockingChild,
      );
    });

    test.each([
      { type: 'gem' as const },
      { type: 'npm' as const },
      { type: 'pip' as const },
    ])('works: $type', async ({ type }) => {
      expect(
        await uninstallTool({
          tool: `dummy-${type}`,
          version: '2.0.0',
          dryRun: false,
          type,
        }),
      ).toBeUndefined();
    });
  });
});
