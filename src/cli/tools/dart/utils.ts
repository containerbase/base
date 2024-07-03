import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { EnvService, PathService } from '../../services';
import { pathExists } from '../../utils';

export async function prepareDartHome(
  envSvc: EnvService,
  pathSvc: PathService,
): Promise<void> {
  // for root
  const rootDart = join(envSvc.rootDir, 'root', '.dart');
  if (!(await pathExists(rootDart, true))) {
    await fs.mkdir(rootDart);
    await fs.writeFile(
      join(rootDart, 'dartdev.json'),
      '{ "firstRun": false, "enabled": false }',
    );
  }

  // for user
  const dart = join(pathSvc.homePath, '.dart');
  if (await pathExists(dart, true)) {
    const dartTool = join(pathSvc.homePath, '.dart-tool');

    await pathSvc.createDir(dart);
    await pathSvc.createDir(dartTool);

    const dartDev = join(dart, 'dartdev.json');
    await pathSvc.writeFile(dartDev, '{ "firstRun": false, "enabled": false }');

    const dartToolTelemetry = join(dartTool, 'dart-flutter-telemetry.config');
    await pathSvc.writeFile(dartToolTelemetry, 'reporting=0\n');

    await fs.symlink(dart, join(envSvc.userHome, '.dart'));
    await fs.symlink(dartTool, join(envSvc.userHome, '.dart-tool'));
  }
}

export async function preparePubCache(
  envSvc: EnvService,
  pathSvc: PathService,
): Promise<void> {
  const pubCache = join(pathSvc.homePath, '.pub-cache');
  if (!(await pathExists(pubCache, true))) {
    await pathSvc.createDir(pubCache);
    await fs.symlink(pubCache, join(envSvc.userHome, '.pub-cache'));
  }
}
