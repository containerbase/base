import { mkdir, readFile, stat } from 'node:fs/promises';
import { platform } from 'node:os';
import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { fileRights } from '../utils';
import { PathService, rootContainer } from '.';
import { rootFile } from '~test/path';

describe('path.service', () => {
  const path = env.PATH;
  let child!: Container;

  beforeEach(() => {
    child = rootContainer.createChild();
    env.PATH = path;
  });

  test('toolsPath', () => {
    expect(child.get(PathService).toolsPath).toBe(
      rootFile('opt/containerbase/tools'),
    );
  });

  test('versionPath', () => {
    expect(child.get(PathService).versionPath).toBe(
      rootFile('opt/containerbase/versions'),
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
});
