import fs from 'node:fs/promises';
import { join } from 'node:path';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService, PathService } from '../services/index.ts';
import { BaseInstallService } from './base-install.service.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

@injectable()
@injectFromHierarchy()
class DummyInstallService extends BaseInstallService {
  readonly name: string = 'dummy';

  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  override link(version: string): Promise<void> {
    return this.shellwrapper({
      srcDir: this.pathSvc.versionedToolPath(this.name, version),
    });
  }

  run(command: string, args: string[]): Promise<unknown> {
    return this._spawn(command, args);
  }
}

/** `bun` is listed in both `NoPrepareTools` and `NoInitTools`. */
@injectable()
@injectFromHierarchy()
class BunInstallService extends DummyInstallService {
  override readonly name = 'bun';
}

describe('cli/install-tool/base-install.service', () => {
  let child!: Container;
  let pathSvc!: PathService;
  let svc!: DummyInstallService;

  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/bin',
      'opt/containerbase/tools',
      'tmp/containerbase/tool.init.d',
      'var/lib/containerbase/tool.prep.d',
    ]);
  });

  beforeEach(async () => {
    child = await testContainer();
    child.bind(DummyInstallService).toSelf();
    child.bind(BunInstallService).toSelf();
    pathSvc = await child.getAsync(PathService);
    svc = await child.getAsync(DummyInstallService);
  });

  test('name and alias', () => {
    expect(svc.name).toBe('dummy');
    expect(svc.alias).toBe('dummy');
    expect(svc.parent).toBeUndefined();
    expect(svc.type).toBeUndefined();
    expect(svc.toString()).toBe('dummy');
  });

  test('isInstalled', async () => {
    expect(await svc.isInstalled('1.0.0')).toBe(false);

    await pathSvc.createVersionedToolPath('dummy', '1.0.0');
    expect(await svc.isInstalled('1.0.0')).toBe(true);
  });

  test('isInitialized', async () => {
    expect(await svc.isInitialized()).toBe(false);

    await pathSvc.setInitialized('dummy');
    expect(await svc.isInitialized()).toBe(true);
  });

  test('isPrepared', async () => {
    expect(await svc.isPrepared()).toBe(false);

    await pathSvc.setPrepared('dummy');
    expect(await svc.isPrepared()).toBe(true);
  });

  test('needsInitialize and needsPrepare', async () => {
    expect(svc.needsInitialize()).toBe(true);
    expect(svc.needsPrepare()).toBe(true);

    const bun = await child.getAsync(BunInstallService);
    expect(bun.needsInitialize()).toBe(false);
    expect(bun.needsPrepare()).toBe(false);
  });

  test('postInstall and test are no-ops', async () => {
    await expect(svc.postInstall('1.0.0')).resolves.toBeUndefined();
    await expect(svc.test('1.0.0')).resolves.toBeUndefined();
  });

  test('uninstall removes the versioned tool path', async () => {
    const path = await pathSvc.createVersionedToolPath('dummy', '2.0.0');

    await expect(svc.uninstall('2.0.0')).resolves.toBeUndefined();

    await expect(fs.stat(path)).rejects.toThrow();
    // uninstalling an unknown version is a no-op
    await expect(svc.uninstall('2.0.0')).resolves.toBeUndefined();
  });

  test('validate', async () => {
    expect(await svc.validate('1.0.0')).toBe(true);
    expect(await svc.validate('not-a-version')).toBe(false);
  });

  test('shellwrapper links with the tool name', async () => {
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.0.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('dummy', {
      srcDir: pathSvc.versionedToolPath('dummy', '1.0.0'),
    });
    expect(await fs.readFile(join(pathSvc.binDir, 'dummy'), 'utf8')).toContain(
      'containerbase-cli init tool "dummy"',
    );
  });

  test('_spawn runs in the temp dir', async () => {
    execaMock.mockResolvedValue({ failed: false });

    await expect(svc.run('dummy', ['--version'])).resolves.toBeDefined();

    expect(execaMock).toHaveBeenCalledWith(
      'dummy',
      ['--version'],
      expect.objectContaining({
        cwd: rootPath('tmp'),
        node: false,
        preferLocal: false,
      }),
    );
  });
});
