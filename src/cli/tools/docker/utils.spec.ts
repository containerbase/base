import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { PathService } from '../../services/index.ts';
import { linkCliPlugin } from './utils.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths } from '~test/path.ts';

describe('cli/tools/docker/utils', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  test('linkCliPlugin: links the plugin to the shim', async () => {
    const pathSvc = await (await testContainer()).getAsync(PathService);
    const plugin = join(pathSvc.cachePath, '.docker/cli-plugins/docker-demo');
    await fs.rm(join(pathSvc.cachePath, '.docker'), {
      recursive: true,
      force: true,
    });

    // creates the plugins folder
    await linkCliPlugin(pathSvc, 'docker-demo', 'demo');
    expect(await fs.readlink(plugin)).toBe(join(pathSvc.binDir, 'demo'));

    // a link to the shim is kept
    const before = await fs.lstat(plugin);
    await linkCliPlugin(pathSvc, 'docker-demo', 'demo');
    expect((await fs.lstat(plugin)).ino).toBe(before.ino);

    // another link or a file is replaced
    await fs.rm(plugin);
    await fs.symlink('/missing/demo', plugin);
    await linkCliPlugin(pathSvc, 'docker-demo', 'demo');
    expect(await fs.readlink(plugin)).toBe(join(pathSvc.binDir, 'demo'));

    await fs.rm(plugin);
    await fs.writeFile(plugin, 'binary');
    await linkCliPlugin(pathSvc, 'docker-demo', 'demo');
    expect(await fs.readlink(plugin)).toBe(join(pathSvc.binDir, 'demo'));
  });
});
