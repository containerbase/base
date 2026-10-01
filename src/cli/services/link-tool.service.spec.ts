import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { ensurePaths, rootPath } from '../../../test/path.ts';
import { createContainer } from '../services/index.ts';
import { pathExists } from '../utils/index.ts';
import { LinkToolService } from './link-tool.service.ts';

describe('cli/services/link-tool.service', async () => {
  const child = createContainer();
  child.bind(LinkToolService).toSelf();
  const svc = await child.getAsync(LinkToolService);

  beforeAll(async () => {
    await ensurePaths('opt/containerbase/bin');
  });

  test('shell-wrapper', async () => {
    const spy = vi.spyOn(fs, 'writeFile');
    await expect(
      svc.shellwrapper('node', {
        srcDir: '/bin/bash',
        extraToolEnvs: ['core'],
        exports: 'T=1',
        body: '# dummy',
        args: '-c',
      }),
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledOnce();

    spy.mockClear();
    await expect(
      svc.shellwrapper('node', {
        srcDir: 'bin',
      }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledOnce();
  });

  test('rm', async () => {
    // removing a wrapper which was never created is a no-op
    await expect(svc.rm('not-linked')).resolves.toBeUndefined();

    await svc.shellwrapper('gone', { srcDir: '/bin/bash' });
    const tgt = rootPath('opt/containerbase/bin/gone');
    expect(await pathExists(tgt, 'file')).toBe(true);

    await expect(svc.rm('gone')).resolves.toBeUndefined();

    expect(await pathExists(tgt, 'file')).toBe(false);
  });

  test('tracks the created links', async () => {
    svc.clear();
    await svc.shellwrapper('node', { srcDir: '/bin/bash' });
    await svc.shellwrapper('node', { srcDir: '/bin/bash', name: 'npm' });

    expect(svc.links).toEqual(['node', 'npm']);

    svc.clear();
    expect(svc.links).toEqual([]);
  });
});
