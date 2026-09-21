import fs from 'node:fs/promises';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PathService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import {
  V1ToolInstallService,
  V2ToolInstallService,
} from './install-legacy-tool.service.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const v1Script = '/usr/local/containerbase/bin/v1-install-tool.sh';
const v2Script = '/usr/local/containerbase/bin/v2-install-tool.sh';

@injectable()
@injectFromHierarchy()
class FullInstallService extends V2ToolInstallService {
  readonly name = 'full';
}

/** A tool script without `post_install`, `uninstall_tool` and the prepare hooks. */
@injectable()
@injectFromHierarchy()
class MinimalInstallService extends V2ToolInstallService {
  readonly name = 'minimal';
}

describe('cli/install-tool/install-legacy-tool.service', () => {
  let child!: Container;
  let pathSvc!: PathService;

  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/tools',
      'usr/local/containerbase/tools/v2',
    ]);
    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/full.sh'),
      '\nfunction prepare_tool () {\n:\n}\nfunction init_tool () {\n:\n}\nfunction post_install () {\n:\n}\nfunction uninstall_tool () {\n:\n}\n',
    );
    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/minimal.sh'),
      'function install_tool () {\n:\n}\n',
    );
  });

  beforeEach(async () => {
    child = await testContainer();
    child.bind(V1ToolInstallService).toSelf();
    child.bind(FullInstallService).toSelf();
    child.bind(MinimalInstallService).toSelf();
    pathSvc = await child.getAsync(PathService);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('V1ToolInstallService', () => {
    test('execute', async () => {
      const svc = await child.getAsync(V1ToolInstallService);

      await expect(svc.execute('leg', '1.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        'bash',
        [v1Script, 'leg', '1.0.0'],
        expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
      );
    });
  });

  describe('V2ToolInstallService', () => {
    test('install', async () => {
      const svc = await child.getAsync(FullInstallService);

      await expect(svc.install('1.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        'bash',
        [v2Script, 'install', 'full', '1.0.0'],
        expect.objectContaining({ env: {} }),
      );
    });

    test('install: uses the replaced pip index', async () => {
      vi.stubEnv('URL_REPLACE_0_FROM', 'https://pypi.org/simple/');
      vi.stubEnv('URL_REPLACE_0_TO', 'https://pypi.example.com/simple/');
      const svc = await child.getAsync(FullInstallService);

      await expect(svc.install('1.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        'bash',
        [v2Script, 'install', 'full', '1.0.0'],
        expect.objectContaining({
          env: { PIP_INDEX_URL: 'https://pypi.example.com/simple/' },
        }),
      );
      vi.unstubAllEnvs();
    });

    test('link', async () => {
      const svc = await child.getAsync(FullInstallService);

      await expect(svc.link('1.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        'bash',
        [v2Script, 'link', 'full', '1.0.0'],
        expect.any(Object),
      );
    });

    test('runs the tool test', async () => {
      const svc = await child.getAsync(FullInstallService);

      await expect(svc.test('1.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        'bash',
        [v2Script, 'test', 'full', '1.0.0'],
        expect.any(Object),
      );
    });

    test('needsInitialize and needsPrepare', async () => {
      const full = await child.getAsync(FullInstallService);
      const minimal = await child.getAsync(MinimalInstallService);

      expect(full.needsInitialize()).toBe(true);
      expect(full.needsPrepare()).toBe(true);
      expect(minimal.needsInitialize()).toBe(false);
      expect(minimal.needsPrepare()).toBe(false);
    });

    test('postInstall', async () => {
      const full = await child.getAsync(FullInstallService);
      const minimal = await child.getAsync(MinimalInstallService);

      await expect(full.postInstall('1.0.0')).resolves.toBeUndefined();
      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        'bash',
        [v2Script, 'post-install', 'full', '1.0.0'],
        expect.any(Object),
      );

      // no `post_install` hook, so nothing is run
      execaMock.mockClear();
      await expect(minimal.postInstall('1.0.0')).resolves.toBeUndefined();
      expect(execaMock).not.toHaveBeenCalled();
    });

    test('uninstall', async () => {
      const svc = await child.getAsync(FullInstallService);
      const path = await pathSvc.createVersionedToolPath('full', '1.0.0');

      await expect(svc.uninstall('1.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledExactlyOnceWith(
        'bash',
        [v2Script, 'uninstall', 'full', '1.0.0'],
        expect.any(Object),
      );
      await expect(fs.stat(path)).rejects.toThrow();
    });

    test('uninstall: without an uninstall hook', async () => {
      const svc = await child.getAsync(MinimalInstallService);
      const path = await pathSvc.createVersionedToolPath('minimal', '1.0.0');

      await expect(svc.uninstall('1.0.0')).resolves.toBeUndefined();

      expect(execaMock).not.toHaveBeenCalled();
      await expect(fs.stat(path)).rejects.toThrow();
    });

    test('validate', async () => {
      const svc = await child.getAsync(FullInstallService);

      expect(await svc.validate('1.0.0')).toBe(true);

      execaMock.mockRejectedValue(new Error('check failed'));
      expect(await svc.validate('1.0.0')).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'validation error',
      );
    });
  });
});
