import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvService, PathService } from '../../services';
import { pathExists } from '../../utils/index.ts';

/**
 * Links the user's `.dart` and `.dart-tool` folders to the cache, and turns
 * off the dart analytics for root.
 */
export async function prepareDartHome(
  envSvc: EnvService,
  pathSvc: PathService,
): Promise<void> {
  const dart = join(envSvc.userHome, '.dart');
  if (!(await pathExists(dart))) {
    await fs.symlink(join(pathSvc.cachePath, '.dart'), dart);
    await fs.symlink(
      join(pathSvc.cachePath, '.dart-tool'),
      join(envSvc.userHome, '.dart-tool'),
    );
  }

  // for root
  const rootDart = join(envSvc.rootDir, 'root', '.dart');
  if (!(await pathExists(rootDart))) {
    await fs.mkdir(rootDart);
    await fs.writeFile(
      join(rootDart, 'dartdev.json'),
      '{ "firstRun": false, "enabled": false }',
    );
  }
}

/**
 * Creates the `.dart` and `.dart-tool` folders in the cache, with analytics
 * and telemetry turned off.
 */
export async function initDartHome(pathSvc: PathService): Promise<void> {
  // for user
  const dart = join(pathSvc.cachePath, '.dart');
  if (!(await pathExists(dart))) {
    const dartTool = join(pathSvc.cachePath, '.dart-tool');

    await pathSvc.createDir(dart);
    await pathSvc.createDir(dartTool);

    const dartDev = join(dart, 'dartdev.json');
    await pathSvc.writeFile(dartDev, '{ "firstRun": false, "enabled": false }');

    const dartToolTelemetry = join(dartTool, 'dart-flutter-telemetry.config');
    await pathSvc.writeFile(dartToolTelemetry, 'reporting=0\n');
  }
}

/** Links the user's `.pub-cache` folder to the cache. */
export async function preparePubCache(
  envSvc: EnvService,
  pathSvc: PathService,
): Promise<void> {
  const pubCache = join(envSvc.userHome, '.pub-cache');
  if (!(await pathExists(pubCache))) {
    await fs.symlink(join(pathSvc.cachePath, '.pub-cache'), pubCache);
  }
}

/** Creates the `.pub-cache` folder in the cache. */
export async function initPubCache(pathSvc: PathService): Promise<void> {
  await pathSvc.createDir(join(pathSvc.cachePath, '.pub-cache'));
}
