import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { EnvService, PathService } from '../../services/index.ts';
import {
  initDartHome,
  initPubCache,
  prepareDartHome,
  preparePubCache,
} from './utils.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths } from '~test/path.ts';

describe('cli/tools/dart/utils', () => {
  let envSvc!: EnvService;
  let pathSvc!: PathService;

  beforeAll(async () => {
    const child = await testContainer();
    envSvc = await child.getAsync(EnvService);
    pathSvc = await child.getAsync(PathService);
    await ensurePaths(['home/ubuntu', 'root']);
  });

  test('initDartHome', async () => {
    const dart = join(pathSvc.cachePath, '.dart');
    const dartTool = join(pathSvc.cachePath, '.dart-tool');

    await expect(initDartHome(pathSvc)).resolves.toBeUndefined();

    expect(await fs.readFile(join(dart, 'dartdev.json'), 'utf8')).toBe(
      '{ "firstRun": false, "enabled": false }',
    );
    expect(
      await fs.readFile(
        join(dartTool, 'dart-flutter-telemetry.config'),
        'utf8',
      ),
    ).toBe('reporting=0\n');

    // second run is a no-op
    await fs.writeFile(join(dart, 'dartdev.json'), 'changed');
    await expect(initDartHome(pathSvc)).resolves.toBeUndefined();
    expect(await fs.readFile(join(dart, 'dartdev.json'), 'utf8')).toBe(
      'changed',
    );
  });

  test('prepareDartHome', async () => {
    await expect(prepareDartHome(envSvc, pathSvc)).resolves.toBeUndefined();

    expect(await fs.readlink(join(envSvc.userHome, '.dart'))).toBe(
      join(pathSvc.cachePath, '.dart'),
    );
    expect(await fs.readlink(join(envSvc.userHome, '.dart-tool'))).toBe(
      join(pathSvc.cachePath, '.dart-tool'),
    );
    expect(
      await fs.readFile(
        join(envSvc.rootDir, 'root', '.dart', 'dartdev.json'),
        'utf8',
      ),
    ).toBe('{ "firstRun": false, "enabled": false }');

    // second run is a no-op, it would throw on existing symlinks otherwise
    await expect(prepareDartHome(envSvc, pathSvc)).resolves.toBeUndefined();
  });

  test('initPubCache', async () => {
    await expect(initPubCache(pathSvc)).resolves.toBeUndefined();
    expect(
      (await fs.stat(join(pathSvc.cachePath, '.pub-cache'))).isDirectory(),
    ).toBe(true);
  });

  test('preparePubCache', async () => {
    await expect(preparePubCache(envSvc, pathSvc)).resolves.toBeUndefined();
    expect(await fs.readlink(join(envSvc.userHome, '.pub-cache'))).toBe(
      join(pathSvc.cachePath, '.pub-cache'),
    );

    // second run is a no-op
    await expect(preparePubCache(envSvc, pathSvc)).resolves.toBeUndefined();
  });
});
