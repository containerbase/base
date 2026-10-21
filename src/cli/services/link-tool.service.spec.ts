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

  test('shell-wrapper checks the init marker below the default temp folder', async () => {
    vi.stubEnv('CONTAINERBASE_TMP_DIR', rootPath('var/cache/containerbase'));

    await svc.shellwrapper('marker', { srcDir: '/bin/bash' });

    const content = await fs.readFile(
      rootPath('opt/containerbase/bin/marker'),
      'utf8',
    );
    expect(content).toContain(
      `if [[ ! -f "${rootPath('tmp/containerbase/tool.init.d/marker')}" ]]; then`,
    );
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

  test('symlink replaces an existing wrapper or link', async () => {
    const tgt = rootPath('opt/containerbase/bin/linked');
    await svc.shellwrapper('linked', { srcDir: '/bin/bash' });

    await expect(
      svc.symlink('linked', { srcDir: '/opt/v1/bin' }),
    ).resolves.toBeUndefined();
    expect(await fs.readlink(tgt)).toBe('/opt/v1/bin/linked');

    await expect(
      svc.symlink('tool', { srcDir: '/opt/v2/bin', name: 'linked' }),
    ).resolves.toBeUndefined();
    expect(await fs.readlink(tgt)).toBe('/opt/v2/bin/linked');
  });

  test('shellwrapper replaces a symlink instead of its target', async () => {
    const bin = rootPath('opt/linked-tool/bin');
    await fs.mkdir(bin, { recursive: true });
    await fs.writeFile(`${bin}/wrapped`, 'binary');
    await svc.symlink('wrapped', { srcDir: bin });
    const tgt = rootPath('opt/containerbase/bin/wrapped');

    await expect(
      svc.shellwrapper('wrapped', { srcDir: '/bin/bash' }),
    ).resolves.toBeUndefined();

    expect(await fs.readFile(`${bin}/wrapped`, 'utf8')).toBe('binary');
    expect((await fs.lstat(tgt)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(tgt, 'utf8')).toContain('/bin/bash "$@"');
  });

  test('rm removes symlinks, also dangling ones', async () => {
    const tgt = rootPath('opt/containerbase/bin/dangling');
    await svc.symlink('dangling', { srcDir: '/not/existing' });

    await expect(svc.rm('dangling')).resolves.toBeUndefined();

    await expect(fs.lstat(tgt)).rejects.toThrow();
  });

  test('rm keeps a folder', async () => {
    const tgt = rootPath('opt/containerbase/bin/folder');
    await fs.mkdir(tgt, { recursive: true });

    await expect(svc.rm('folder')).resolves.toBeUndefined();

    expect(await pathExists(tgt, 'dir')).toBe(true);
  });

  test('tracks the created links', async () => {
    svc.clear();
    await svc.shellwrapper('node', { srcDir: '/bin/bash' });
    await svc.shellwrapper('node', { srcDir: '/bin/bash', name: 'npm' });
    await svc.symlink('node', { srcDir: '/bin', name: 'corepack' });

    expect(svc.links).toEqual(['corepack', 'node', 'npm']);

    svc.clear();
    expect(svc.links).toEqual([]);
  });
});
