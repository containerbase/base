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
  const dart = join(envSvc.userHome, '.dart');
  if (await pathExists(dart, true)) {
    const dartTool = join(envSvc.userHome, '.dart-tool');

    await pathSvc.createDir(dart);
    await pathSvc.createDir(dartTool);

    const dartDev = join(dart, 'dartdev.json');
    await pathSvc.writeFile(dartDev, '{ "firstRun": false, "enabled": false }');

    const dartToolTelemetry = join(dartTool, 'dart-flutter-telemetry.config');
    await pathSvc.writeFile(dartToolTelemetry, 'reporting=0\n');
  }
}

export async function preparePubCache(
  envSvc: EnvService,
  pathSvc: PathService,
): Promise<void> {
  const pubCache = join(envSvc.userHome, '.pub-cache');
  if (!(await pathExists(pubCache, true))) {
    await pathSvc.createDir(pubCache);
  }
}
