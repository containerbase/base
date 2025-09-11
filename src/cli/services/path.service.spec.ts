import { mkdir, readFile, stat } from 'node:fs/promises';
import { platform } from 'node:os';
import { env } from 'node:process';
import { deleteAsync } from 'del';
import { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { fileRights, pathExists } from '../utils';
import { PathService } from '.';
import { testContainer } from '~test/di';
import { ensurePaths, rootPath } from '~test/path';

describe('cli/services/path.service', () => {
  const path = env.PATH;
  let child!: Container;
  let pathSvc!: PathService;

  beforeEach(async () => {
    child = await testContainer();
    env.PATH = path;
    delete env.NODE_VERSION;
    pathSvc = await child.getAsync(PathService);
    await deleteAsync('**', { force: true, dot: true, cwd: rootPath() });
    await ensurePaths([
      'var/lib/containerbase/tool.prep.d',
      'tmp/containerbase/tool.init.d',
    ]);
  });

  test('cachePath', () => {
    expect(pathSvc.cachePath).toBe(rootPath('tmp/containerbase/cache'));
  });

  test('envFile', () => {
    expect(pathSvc.envFile).toBe(rootPath('usr/local/etc/env'));
  });

  test('tmpDir', () => {
    expect(pathSvc.tmpDir).toBe(rootPath('tmp/containerbase'));
  });

  test('sslPath', () => {
    expect(pathSvc.sslPath).toBe(rootPath('opt/containerbase/ssl'));
  });

  test('toolsPath', () => {
    expect(pathSvc.toolsPath).toBe(rootPath('opt/containerbase/tools'));
  });

  test('versionPath', () => {
    expect(pathSvc.versionPath).toBe(rootPath('opt/containerbase/versions'));
  });

  test('resetToolEnv', async () => {
    expect(await pathSvc.resetToolEnv('node')).toBeUndefined();
  });

  test('toolEnvExists', async () => {
    expect(await pathSvc.toolEnvExists('node')).toBe(false);
  });

  test('ensureBasePaths', async () => {
    await pathSvc.ensureBasePaths();
    expect(await pathExists(rootPath('opt/containerbase'), 'dir')).toBe(true);
    expect(await pathExists(rootPath('var/lib/containerbase'), 'dir')).toBe(
      true,
    );
    expect(await pathExists(rootPath('tmp/containerbase'), 'dir')).toBe(true);
  });

  test('exportToolEnvContent', async () => {
    await mkdir(`${pathSvc.installDir}/tools`, { recursive: true });

    await pathSvc.exportToolEnvContent(
      'node',
      'export NODE_VERSION=v14.17.0\n',
    );
    const s = await stat(`${pathSvc.installDir}/tools/node/env.sh`);
    expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o644);
    expect(
      await readFile(`${pathSvc.installDir}/tools/node/env.sh`, 'utf8'),
    ).toBe('\nexport NODE_VERSION=v14.17.0\n');
  });

  test('versionedToolPath', () => {
    expect(pathSvc.versionedToolPath('node', '18.0.1')).toBe(
      rootPath('opt/containerbase/tools/node/18.0.1'),
    );
  });

  test('creates and finds tool paths', async () => {
    await mkdir(rootPath('opt/containerbase/tools'), { recursive: true });
    expect(await pathSvc.findToolPath('node')).toBeNull();
    await pathSvc.createToolPath('node');
    expect(await pathSvc.findToolPath('node')).toBe(
      rootPath('opt/containerbase/tools/node'),
    );
    expect(await pathSvc.findVersionedToolPath('node', '18.0.1')).toBeNull();
    await pathSvc.createVersionedToolPath('node', '18.0.1');
    expect(await pathSvc.findVersionedToolPath('node', '18.0.1')).toBe(
      rootPath('opt/containerbase/tools/node/18.0.1'),
    );
  });

  test('exportEnv', async () => {
    await mkdir(rootPath('usr/local/etc'), { recursive: true });
    await pathSvc.exportEnv({ NODE_VERSION: 'v14.17.1' });
    await pathSvc.exportEnv({ TEST: '/tmp/test' }, true);

    expect(env).toMatchObject({ NODE_VERSION: 'v14.17.1' });
    const content = await readFile(rootPath('usr/local/etc/env'), 'utf8');
    expect(content).toContain('export NODE_VERSION=${NODE_VERSION-v14.17.1}\n');
    expect(content).toContain(
      'if [ "${EUID}" != 0 ]; then\nexport TEST=${TEST-/tmp/test}\nfi\n',
    );
  });

  test('exportPath', async () => {
    await mkdir(rootPath('usr/local/etc'), { recursive: true });
    await pathSvc.exportPath('/some/path');

    expect(env).toMatchObject({ PATH: `/some/path:${path}` });
    const content = await readFile(rootPath('usr/local/etc/env'), 'utf8');
    expect(content).toContain('export PATH=/some/path:$PATH\n');
  });

  describe('exportToolEnv', () => {
    test('node', async () => {
      await mkdir(`${pathSvc.installDir}/tools`, { recursive: true });
      await pathSvc.exportToolEnv('node', { NODE_VERSION: 'v14.17.0' });
      await pathSvc.exportToolEnv('node', { TEST: '/tmp/test' }, true);
      expect(env).toMatchObject({
        NODE_VERSION: 'v14.17.0',
      });

      const s = await stat(`${pathSvc.installDir}/tools/node/env.sh`);

      expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o664);

      await pathSvc.resetToolEnv('node');
      await expect(
        stat(`${pathSvc.installDir}/tools/node/env.sh`),
      ).rejects.toThrow('ENOENT');
    });
  });

  describe('exportToolPath', () => {
    test('node', async () => {
      await mkdir(`${pathSvc.installDir}/tools`, { recursive: true });
      await pathSvc.exportToolPath('node', '/some/path');
      expect(env).toMatchObject({
        PATH: `/some/path:${path}`,
      });

      await pathSvc.exportToolPath('node', '/some/path', true);
      expect(env).toMatchObject({
        PATH: `/some/path:${path}:/some/path`,
      });
    });
  });

  test('ensureToolPath', async () => {
    await mkdir(rootPath('opt/containerbase/tools'), { recursive: true });
    expect(await pathSvc.ensureToolPath('node')).toBe(
      rootPath('opt/containerbase/tools/node'),
    );
    expect(
      await pathExists(rootPath('opt/containerbase/tools/node'), 'dir'),
    ).toBe(true);
  });

  test('fileExists', async () => {
    expect(await pathSvc.fileExists(rootPath('usr/local/etc/env123'))).toBe(
      false,
    );
  });

  test('createDir', async () => {
    const dir = rootPath('env123/sub');
    expect(await pathSvc.createDir(dir)).toBeUndefined();

    const s = await stat(dir);
    expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o775);
    expect(await pathSvc.createDir(dir)).toBeUndefined();
  });

  test('toolInit', async () => {
    expect(pathSvc.toolInitPath('node')).toBe(
      rootPath('tmp/containerbase/tool.init.d/node'),
    );
    expect(await pathSvc.isInitialized('node')).toBe(false);
    await pathSvc.setInitialized('node');
    expect(await pathSvc.isInitialized('node')).toBe(true);
  });

  test('toolPrepare', async () => {
    expect(pathSvc.toolPreparePath('node')).toBe(
      rootPath('var/lib/containerbase/tool.prep.d/node'),
    );
    expect(await pathSvc.isPrepared('node')).toBe(false);
    await pathSvc.setPrepared('node');
    expect(await pathSvc.isPrepared('node')).toBe(true);
  });

  test('writeFile', async () => {
    const file = rootPath('env123');
    await pathSvc.writeFile(file, 'test');

    const s = await stat(file);
    expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o664);
    expect(await readFile(file, 'utf8')).toBe('test');
  });
});
