import fs from 'node:fs/promises';
import { codeBlock } from 'common-tags';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { ensurePaths, rootPath } from '../../../test/path.ts';
import { createContainer } from '../services/index.ts';
import { pathExists } from '../utils/index.ts';
import { LinkToolService } from './link-tool.service.ts';

/**
 * The error of looking up the path without following links, so a dangling
 * link counts as existing.
 */
function lookup(path: string): Promise<unknown> {
  return fs.lstat(path).then(
    () => null,
    (err: NodeJS.ErrnoException) => err.code,
  );
}

describe('cli/services/link-tool.service', async () => {
  const child = createContainer();
  child.bind(LinkToolService).toSelf();
  const svc = await child.getAsync(LinkToolService);

  beforeAll(async () => {
    await ensurePaths(['opt/containerbase/bin', 'opt/containerbase/links']);
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

  test('shellwrapper keeps argv0 on request', async () => {
    const tgt = rootPath('opt/containerbase/bin/wrapped');

    await expect(
      svc.shellwrapper('wrapped', { srcDir: '/bin/bash', keepArgv0: true }),
    ).resolves.toBeUndefined();

    expect(await fs.readFile(tgt, 'utf8')).toContain(
      'exec -a "$0" /bin/bash "$@"',
    );
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

  test('legacyShellwrapper writes the wrapper into the bin folder', async () => {
    await expect(
      svc.legacyShellwrapper('legacy', { srcDir: '/bin/bash' }),
    ).resolves.toBeUndefined();

    expect(
      await fs.readFile(rootPath('opt/containerbase/bin/legacy'), 'utf8'),
    ).toContain('/bin/bash "$@"');
  });

  test('keeps the link context until cleared', () => {
    svc.clear();
    expect(svc.context).toBeNull();

    const context = { tool: 'node', version: '22.0.0', dir: '/opt/node' };
    svc.setContext(context);
    expect(svc.context).toEqual(context);

    svc.clear();
    expect(svc.context).toBeNull();
  });

  test('resetContext keeps the recorded links', async () => {
    svc.clear();
    svc.setContext({ tool: 'node', version: '22.0.0', dir: '/opt/node' });
    await svc.legacyShellwrapper('reset-tool', { srcDir: '/bin/bash' });

    svc.resetContext();

    expect(svc.context).toBeNull();
    expect(svc.links).toEqual(['reset-tool']);
    svc.clear();
  });

  describe('with a link context', () => {
    let bin = '';
    let links = '';

    beforeAll(() => {
      bin = rootPath('opt/containerbase/bin');
      links = rootPath('opt/containerbase/links');
    });

    /** The folder of a version of `tool`. */
    function versionDir(tool: string, version: string): string {
      return rootPath(`opt/containerbase/tools/${tool}/${version}`);
    }

    /** Links the commands of a tool version, as an install does. */
    async function link(
      tool: string,
      version: string,
      names: string[],
      restore?: boolean,
    ): Promise<void> {
      svc.clear();
      svc.setContext({
        tool,
        version,
        dir: versionDir(tool, version),
        ...(restore && { restore }),
      });
      for (const name of names) {
        await svc.shellwrapper(tool, { srcDir: '/bin/bash', name });
      }
    }

    test('writes the shim into the bin folder', async () => {
      await link('shim-tool', '1.0.0', ['shim-cmd']);

      expect(await fs.readFile(`${bin}/shim-cmd`, 'utf8')).toBe(
        `${codeBlock`
          #!/bin/bash
          if [[ ! -f ${links}/shim-cmd ]]; then
            [[ -z "\${CONTAINERBASE_ENSURE}" ]] || exit 127
            CONTAINERBASE_ENSURE=1 CONTAINERBASE_LOG_LEVEL=warn ${rootPath('usr/local/sbin/containerbase-cli')} ensure shim-cmd </dev/null >&2 || exit
          fi
          . ${links}/shim-cmd
        `}\n`,
      );
      expect((await fs.stat(`${bin}/shim-cmd`)).mode & 0o777).toBe(0o775);
    });

    test('writes the wrapper into the folder of the version', async () => {
      await link('wrap-tool', '1.0.0', ['wrap-cmd']);

      const wrapper = `${versionDir('wrap-tool', '1.0.0')}/.wrappers/wrap-cmd`;
      expect(await fs.readFile(wrapper, 'utf8')).toBe(
        `${codeBlock`
          #!/bin/bash

          if [[ -z "\${CONTAINERBASE_ENV+x}" ]]; then
            . ${rootPath('usr/local/etc/env')}
          fi

          if [[ ! -f "${rootPath('tmp/containerbase/tool.init.d/wrap-tool')}" ]]; then
            # set logging to only warn and above to not interfere with tool output
            CONTAINERBASE_LOG_LEVEL=warn containerbase-cli init tool "wrap-tool"
          fi
          # load tool envs
          include () {
              local file=${rootPath('opt/containerbase/tools')}/$1/env.sh
              [[ -f "$file" ]] && source "$file"
          }
          include wrap-tool
          unset include
          /bin/bash "$@"
        `}\n`,
      );
      expect((await fs.stat(wrapper)).mode & 0o777).toBe(0o664);
      expect(svc.links).toEqual(['wrap-cmd']);
    });

    test('does not point the command, see point()', async () => {
      await link('lazy-tool', '1.0.0', ['lazy-cmd']);

      expect(await lookup(`${links}/lazy-cmd`)).toBe('ENOENT');
    });

    test('writes unchanged files only once', async () => {
      await link('once-tool', '1.0.0', ['once-cmd']);
      const spy = vi.spyOn(fs, 'writeFile');

      await link('once-tool', '1.0.0', ['once-cmd']);
      expect(spy).not.toHaveBeenCalled();

      // a changed wrapper is written again
      await svc.shellwrapper('once-tool', {
        srcDir: '/bin/bash',
        name: 'once-cmd',
        args: '--changed',
      });
      expect(spy).toHaveBeenCalledOnce();
    });

    test('replaces a full wrapper or a link with the shim', async () => {
      await svc.legacyShellwrapper('full-tool', { srcDir: '/bin/bash' });
      await link('full-tool', '1.0.0', ['full-tool']);
      expect(await fs.readFile(`${bin}/full-tool`, 'utf8')).toContain(
        'ensure full-tool',
      );

      await fs.rm(`${bin}/full-tool`);
      await fs.symlink('/bin/bash', `${bin}/full-tool`);
      await link('full-tool', '1.0.0', ['full-tool']);
      expect((await fs.lstat(`${bin}/full-tool`)).isSymbolicLink()).toBe(false);
      expect(await fs.readFile(`${bin}/full-tool`, 'utf8')).toContain(
        'ensure full-tool',
      );
    });

    test('restore mode only writes the wrapper', async () => {
      await link('restore-tool', '1.0.0', ['restore-cmd'], true);

      expect(
        await pathExists(
          `${versionDir('restore-tool', '1.0.0')}/.wrappers/restore-cmd`,
          'file',
        ),
      ).toBe(true);
      expect(await lookup(`${bin}/restore-cmd`)).toBe('ENOENT');
      expect(await lookup(`${links}/restore-cmd`)).toBe('ENOENT');
    });

    test('point links the command to its wrapper', async () => {
      await link('point-tool', '1.0.0', ['point-cmd']);
      const wrapper = `${versionDir('point-tool', '1.0.0')}/.wrappers/point-cmd`;

      await svc.point('point-cmd');

      expect(await fs.readlink(`${links}/point-cmd`)).toBe(wrapper);
      // no temp link is left
      expect(
        (await fs.readdir(links)).filter((f) => f.startsWith('point-cmd')),
      ).toEqual(['point-cmd']);

      // an unchanged pointer is not written again
      const spy = vi.spyOn(fs, 'symlink');
      await svc.point('point-cmd');
      expect(spy).not.toHaveBeenCalled();
    });

    test('point ignores a command without a wrapper', async () => {
      svc.clear();
      await svc.symlink('plain-tool', { srcDir: '/bin' });

      await svc.point('plain-tool');

      expect(await lookup(`${links}/plain-tool`)).toBe('ENOENT');
    });

    test('point leaves the temp links of other runs alone', async () => {
      await link('stale-tool', '1.0.0', ['stale-cmd']);
      await fs.symlink('/stale', `${links}/stale-cmd.tmp`);

      await svc.point('stale-cmd');

      expect(await pathExists(`${links}/stale-cmd`, 'file')).toBe(true);
      expect(await fs.readlink(`${links}/stale-cmd.tmp`)).toBe('/stale');
    });

    test('point writes the pointer through a temp link of its own', async () => {
      await link('temp-tool', '1.0.0', ['temp-cmd']);
      const rename = vi.spyOn(fs, 'rename');

      await svc.point('temp-cmd');

      expect(rename).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(
          new RegExp(`^${links}/temp-cmd\\.${process.pid}\\.[0-9a-f]{8}$`),
        ),
        `${links}/temp-cmd`,
      );
    });

    test('point removes its temp link when the pointer cannot be written', async () => {
      await link('fail-tool', '1.0.0', ['fail-cmd']);
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('EIO'));

      await expect(svc.point('fail-cmd')).rejects.toThrow('EIO');

      expect(
        (await fs.readdir(links)).filter((f) => f.startsWith('fail-cmd')),
      ).toEqual([]);
    });

    test('a switch keeps the commands only the old version linked', async () => {
      const py = (version: string): string =>
        `${versionDir('py-tool', version)}/.wrappers`;
      await link('py-tool', '3.11.0', ['py', 'py3.11']);
      await svc.point('py');
      await svc.point('py3.11');

      await link('py-tool', '3.12.0', ['py', 'py3.12']);
      await svc.point('py');
      await svc.point('py3.12');

      expect(await fs.readlink(`${links}/py`)).toBe(`${py('3.12.0')}/py`);
      expect(await fs.readlink(`${links}/py3.11`)).toBe(
        `${py('3.11.0')}/py3.11`,
      );
      expect(await fs.readlink(`${links}/py3.12`)).toBe(
        `${py('3.12.0')}/py3.12`,
      );
    });

    test('legacy wrappers and symlinks remove a stale pointer', async () => {
      await link('legacy-tool', '1.0.0', ['legacy-a', 'legacy-b']);
      await svc.point('legacy-a');
      await svc.point('legacy-b');

      await svc.legacyShellwrapper('legacy-tool', {
        srcDir: '/bin/bash',
        name: 'legacy-a',
      });
      await svc.symlink('legacy-tool', { srcDir: '/bin', name: 'legacy-b' });

      expect(await lookup(`${links}/legacy-a`)).toBe('ENOENT');
      expect(await lookup(`${links}/legacy-b`)).toBe('ENOENT');
    });

    test.each(['EROFS', 'EACCES'])(
      'legacy links ignore a pointer which cannot be removed: %s',
      async (code) => {
        const pointer = `${links}/locked-cmd`;
        const rm = fs.rm;
        vi.spyOn(fs, 'rm').mockImplementation((path, options) =>
          path === pointer
            ? Promise.reject(Object.assign(new Error(code), { code }))
            : rm(path, options),
        );

        await svc.legacyShellwrapper('locked-tool', {
          srcDir: '/bin/bash',
          name: 'locked-cmd',
        });
        await svc.symlink('locked-tool', {
          srcDir: '/bin',
          name: 'locked-cmd',
        });

        expect((await fs.lstat(`${bin}/locked-cmd`)).isSymbolicLink()).toBe(
          true,
        );
      },
    );

    test('legacy links fail on other errors removing the pointer', async () => {
      const pointer = `${links}/broken-cmd`;
      const rm = fs.rm;
      vi.spyOn(fs, 'rm').mockImplementation((path, options) =>
        path === pointer
          ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' }))
          : rm(path, options),
      );

      await expect(
        svc.legacyShellwrapper('broken-tool', {
          srcDir: '/bin/bash',
          name: 'broken-cmd',
        }),
      ).rejects.toThrow('EIO');
    });

    test('rm removes the pointer, also a dangling one', async () => {
      await link('rm-tool', '1.0.0', ['rm-cmd']);
      await svc.point('rm-cmd');
      await fs.rm(versionDir('rm-tool', '1.0.0'), { recursive: true });

      await svc.rm('rm-cmd');

      await expect(fs.lstat(`${links}/rm-cmd`)).rejects.toThrow();
      await expect(fs.lstat(`${bin}/rm-cmd`)).rejects.toThrow();
    });

    describe('restorePointer', () => {
      const tool = { name: 'rp-tool', version: '1.0.0' };

      test('points at the wrapper of the version', async () => {
        await link('rp-tool', '1.0.0', ['rp-cmd']);

        expect(await svc.restorePointer('rp-cmd', tool, [])).toBe(true);

        expect(await fs.readlink(`${links}/rp-cmd`)).toBe(
          `${versionDir('rp-tool', '1.0.0')}/.wrappers/rp-cmd`,
        );
      });

      test('prefers the first parent version with a wrapper', async () => {
        const dir = versionDir('rp-tool', '1.0.0');
        for (const parent of ['22.0.0', '24.0.0']) {
          await fs.mkdir(`${dir}/${parent}/.wrappers`, { recursive: true });
          await fs.writeFile(`${dir}/${parent}/.wrappers/rp-npm`, '');
        }

        expect(
          await svc.restorePointer('rp-npm', tool, [
            '26.0.0',
            '24.0.0',
            '22.0.0',
          ]),
        ).toBe(true);

        expect(await fs.readlink(`${links}/rp-npm`)).toBe(
          `${dir}/24.0.0/.wrappers/rp-npm`,
        );
      });

      test('does nothing without a wrapper', async () => {
        expect(await svc.restorePointer('rp-gone', tool, ['22.0.0'])).toBe(
          false,
        );

        expect(await lookup(`${links}/rp-gone`)).toBe('ENOENT');
      });
    });
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
