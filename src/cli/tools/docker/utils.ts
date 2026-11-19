import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { PathService } from '../../services/index.ts';

/**
 * The docker cli plugins which are linked to the shim of their command: the
 * name of the plugin file and the command of the tool.
 */
export const cliPlugins = [
  { plugin: 'docker-buildx', command: 'buildx' },
  { plugin: 'docker-compose', command: 'docker-compose' },
] as const;

/**
 * Links a docker cli plugin to the shim of its command in the global bin
 * folder, instead of to a version binary. The shim doesn't use its name, so it
 * works through the plugin name too, and its pointer selects the version and
 * installs it on its first call. A link to the shim is kept, any other link or
 * file is replaced.
 */
export async function linkCliPlugin(
  pathSvc: PathService,
  plugin: string,
  command: string,
): Promise<void> {
  const dir = join(pathSvc.cachePath, '.docker/cli-plugins');
  const tgt = join(dir, plugin);
  const shim = join(pathSvc.binDir, command);
  if ((await fs.readlink(tgt).catch(() => null)) === shim) {
    return;
  }
  await pathSvc.createDir(dir);
  await fs.rm(tgt, { force: true });
  await fs.symlink(shim, tgt);
}
