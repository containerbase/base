import { mkdir, readFile, stat } from 'node:fs/promises';
import { platform } from 'node:os';
import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { fileRights } from '../utils';
import { PathService, rootContainer } from '.';
import { rootPath } from '~test/path';

describe('path.service', () => {
  const path = env.PATH;
  let child!: Container;

  beforeEach(() => {
    child = rootContainer.createChild();
    env.PATH = path;
    delete env.NODE_VERSION;
  });

  test('cachePath', () => {
    expect(child.get(PathService).cachePath).toBe(
      rootPath('opt/containerbase/cache'),
    );
  });

  test('envFile', () => {
    expect(child.get(PathService).envFile).toBe(rootPath('usr/local/etc/env'));
  });

  test('tmpDir', () => {
    expect(child.get(PathService).tmpDir).toBe(rootPath('tmp'));
  });

  test('homePath', () => {
    expect(child.get(PathService).homePath).toBe(
      rootPath('opt/containerbase/home'),
    );
  });

  test('toolsPath', () => {
    expect(child.get(PathService).toolsPath).toBe(
      rootPath('opt/containerbase/tools'),
    );
  });

  test('versionPath', () => {
    expect(child.get(PathService).versionPath).toBe(
      rootPath('opt/containerbase/versions'),
    );
  });

  test('resetToolEnv', async () => {
    expect(await child.get(PathService).resetToolEnv('node')).toBeUndefined();
  });

  test('exportToolEnvContent', async () => {
    const pathSvc = child.get(PathService);

    await mkdir(`${pathSvc.installDir}/env.d`, { recursive: true });
    await pathSvc.exportToolEnvContent(
      'node',
      'export NODE_VERSION=v14.17.0\n',
    );
    const s = await stat(`${pathSvc.installDir}/env.d/node.sh`);
    expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o644);
    expect(await readFile(`${pathSvc.installDir}/env.d/node.sh`, 'utf8')).toBe(
      'export NODE_VERSION=v14.17.0\n',
    );
  });

  test('versionedToolPath', () => {
    expect(child.get(PathService).versionedToolPath('node', '18.0.1')).toBe(
      rootPath('opt/containerbase/tools/node/18.0.1'),
    );
  });

  test('creates and finds tool paths', async () => {
    await mkdir(rootPath('opt/containerbase/tools'), { recursive: true });
    const svc = child.get(PathService);
    expect(await svc.findToolPath('node')).toBeNull();
    await svc.createToolPath('node');
    expect(await svc.findToolPath('node')).toBe(
      rootPath('opt/containerbase/tools/node'),
    );
    expect(await svc.findVersionedToolPath('node', '18.0.1')).toBeNull();
    await svc.createVersionedToolPath('node', '18.0.1');
    expect(await svc.findVersionedToolPath('node', '18.0.1')).toBe(
      rootPath('opt/containerbase/tools/node/18.0.1'),
    );
  });

  test('exportEnv', async () => {
    await mkdir(rootPath('usr/local/etc'), { recursive: true });
    await child.get(PathService).exportEnv({ NODE_VERSION: 'v14.17.1' });

    expect(env).toMatchObject({ NODE_VERSION: 'v14.17.1' });
    const content = await readFile(rootPath('usr/local/etc/env'), 'utf8');
    expect(content).toContain('export NODE_VERSION=${NODE_VERSION-v14.17.1}\n');
  });

  test('exportPath', async () => {
    await mkdir(rootPath('usr/local/etc'), { recursive: true });
    await child.get(PathService).exportPath('/some/path');

    expect(env).toMatchObject({ PATH: `/some/path:${path}` });
    const content = await readFile(rootPath('usr/local/etc/env'), 'utf8');
    expect(content).toContain('export PATH=/some/path:$PATH\n');
  });

  describe('exportToolEnv', () => {
    test('node', async () => {
      const pathSvc = child.get(PathService);

      await mkdir(`${pathSvc.installDir}/env.d`, { recursive: true });
      await pathSvc.exportToolEnv('node', { NODE_VERSION: 'v14.17.0' });
      expect(env).toMatchObject({
        NODE_VERSION: 'v14.17.0',
      });

      const s = await stat(`${pathSvc.installDir}/env.d/node.sh`);

      expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o644);

      await child.get(PathService).resetToolEnv('node');
      await expect(stat(`${pathSvc.installDir}/env.d/node.sh`)).rejects.toThrow(
        'ENOENT',
      );
    });
  });

  describe('exportToolPath', () => {
    test('node', async () => {
      const pathSvc = child.get(PathService);

      await mkdir(`${pathSvc.installDir}/env.d`, { recursive: true });
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

  test('fileExists', async () => {
    expect(
      await child.get(PathService).fileExists(rootPath('usr/local/etc/env123')),
    ).toBe(false);
  });
});
