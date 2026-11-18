import fs, { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { env, getuid } from 'node:process';
import { deleteAsync } from 'del';
import { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fileRights, logger, pathExists } from '../utils/index.ts';
import { EnvService, PathService } from './index.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

describe('cli/services/path.service', () => {
  const path = env.PATH;
  let child!: Container;
  let pathSvc!: PathService;

  beforeEach(async () => {
    child = await testContainer();
    vi.stubEnv('PATH', path);
    vi.stubEnv('NODE_VERSION', undefined);
    pathSvc = await child.getAsync(PathService);
    await deleteAsync('**', { force: true, dot: true, cwd: rootPath() });
    await ensurePaths([
      'tmp/containerbase/tool.init.d',
      'var/lib/containerbase/tool.prep.d',
    ]);
  });

  test('cachePath', () => {
    expect(pathSvc.cachePath).toBe(rootPath('tmp/containerbase/cache'));
  });

  test('dataPath', () => {
    expect(child.get(PathService).dataPath).toBe(
      rootPath('opt/containerbase/data'),
    );
  });

  test('envFile', () => {
    expect(pathSvc.envFile).toBe(rootPath('usr/local/etc/env'));
  });

  test('tmpDir', () => {
    expect(pathSvc.tmpDir).toBe(rootPath('tmp/containerbase'));
  });

  test('snapshotDir', () => {
    expect(pathSvc.snapshotDir).toBe(rootPath('var/lib/containerbase/opt'));
  });

  test('sslPath', () => {
    expect(pathSvc.sslPath).toBe(rootPath('opt/containerbase/ssl'));
  });

  test('toolsPath', () => {
    expect(pathSvc.toolsPath).toBe(rootPath('opt/containerbase/tools'));
  });

  test('versionPath', () => {
    expect(pathSvc.versionPath).toBe(rootPath('opt/containerbase/versions'));
  });

  test('resetToolEnv', async () => {
    expect(await pathSvc.resetToolEnv('node')).toBeUndefined();
  });

  test('toolEnvExists', async () => {
    expect(await pathSvc.toolEnvExists('node')).toBe(false);
  });

  test('ensureBasePaths', async () => {
    await pathSvc.ensureBasePaths();
    expect(await pathExists(rootPath('opt/containerbase'), 'dir')).toBe(true);
    expect(await pathExists(rootPath('var/lib/containerbase'), 'dir')).toBe(
      true,
    );
    expect(await pathExists(rootPath('tmp/containerbase'), 'dir')).toBe(true);
    expect(await pathExists(join(pathSvc.cachePath, '.npm'), 'dir')).toBe(true);
    expect(await pathExists(join(pathSvc.cachePath, '.yarn'), 'dir')).toBe(
      true,
    );
  });

  test('ensureBasePaths keeps a linked npm cache folder', async () => {
    const npm = join(pathSvc.cachePath, '.npm');
    await ensurePaths(['var/cache/npm-volume', 'tmp/containerbase/cache']);
    await deleteAsync(npm, { force: true });
    await fs.symlink(rootPath('var/cache/npm-volume'), npm);

    try {
      await pathSvc.ensureBasePaths();
      expect(await fs.readlink(npm)).toBe(rootPath('var/cache/npm-volume'));
    } finally {
      await fs.rm(npm);
    }
  });

  test('ensureCacheDir skips a link to a missing folder', async () => {
    const yarn = join(pathSvc.cachePath, '.yarn');
    await ensurePaths('tmp/containerbase/cache');
    await deleteAsync(yarn, { force: true });
    await fs.symlink(rootPath('var/cache/missing'), yarn);

    try {
      await expect(pathSvc.ensureCacheDir('.yarn')).resolves.toBeUndefined();
      expect(await fs.readlink(yarn)).toBe(rootPath('var/cache/missing'));
      expect(await pathExists(rootPath('var/cache/missing'))).toBe(false);
      expect(logger.debug).toHaveBeenCalledWith(
        { path: yarn },
        'cache link target missing',
      );
    } finally {
      await fs.rm(yarn);
    }
  });

  describe('with CONTAINERBASE_TMP_DIR', () => {
    beforeEach(() => {
      vi.stubEnv('CONTAINERBASE_TMP_DIR', rootPath('var/cache/containerbase'));
    });

    test('tmpDir uses the configured folder, cachePath the default one', () => {
      expect(pathSvc.tmpDir).toBe(rootPath('var/cache/containerbase'));
      expect(pathSvc.defaultTmpDir).toBe(rootPath('tmp/containerbase'));
      expect(pathSvc.cachePath).toBe(rootPath('tmp/containerbase/cache'));
    });

    test('ensureBasePaths links the default folder', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });

      await pathSvc.ensureBasePaths();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
      expect(
        await pathExists(
          rootPath('var/cache/containerbase/tool.init.d'),
          'dir',
        ),
      ).toBe(true);
      expect(await pathExists(join(pathSvc.cachePath, '.config'), 'dir')).toBe(
        true,
      );
    });

    /**
     * Lets the env service report root, only root moves a default folder. The
     * configured user is the test user, who owns the test folders.
     */
    function asRoot(): void {
      vi.spyOn(child.get(EnvService), 'isRoot', 'get').mockReturnValue(true);
      vi.stubEnv('USER_ID', `${getuid!()}`);
    }

    /**
     * Expects the warning with the `problem` of the configured folder, or the
     * full `reason`, and the default folder kept for this run.
     */
    function expectDefaultTmpDir(
      problem: string,
      reason = `${rootPath('var/cache/containerbase')} ${problem}`,
    ): void {
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        `cannot switch ${rootPath('tmp/containerbase')} to ${rootPath('var/cache/containerbase')}, keeping the default folder: ${reason}`,
      );
      expect(env.CONTAINERBASE_TMP_DIR).toBe(rootPath('tmp/containerbase'));
      expect(pathSvc.tmpDir).toBe(rootPath('tmp/containerbase'));
    }

    test('ensureBasePaths moves an existing default folder as root', async () => {
      asRoot();
      await ensurePaths([
        'tmp/containerbase/cache/.npm',
        'var/cache/containerbase/cache',
      ]);
      await writeFile(rootPath('tmp/containerbase/tool.init.d/node'), '');
      await writeFile(rootPath('tmp/containerbase/cache/.npmrc'), 'old');
      await writeFile(rootPath('var/cache/containerbase/cache/.npmrc'), 'keep');

      await pathSvc.ensureBasePaths();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
      expect(
        await pathExists(
          rootPath('var/cache/containerbase/tool.init.d/node'),
          'file',
        ),
      ).toBe(true);
      expect(
        await pathExists(rootPath('var/cache/containerbase/cache/.npm'), 'dir'),
      ).toBe(true);
      expect(
        await readFile(
          rootPath('var/cache/containerbase/cache/.npmrc'),
          'utf8',
        ),
      ).toBe('keep');
    });

    test('ensureTmpLink moves across devices with mv', async () => {
      asRoot();
      await writeFile(rootPath('tmp/containerbase/tool.init.d/node'), '');
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EXDEV'), { code: 'EXDEV' }),
      );

      await pathSvc.ensureTmpLink();

      expect(
        await pathExists(
          rootPath('var/cache/containerbase/tool.init.d/node'),
          'file',
        ),
      ).toBe(true);
    });

    test('ensureTmpLink rethrows other errors moving the default folder', async () => {
      asRoot();
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EBUSY'), { code: 'EBUSY' }),
      );

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EBUSY');
    });

    test('ensureTmpLink keeps a default folder as non-root without moving it', async () => {
      vi.spyOn(child.get(EnvService), 'isRoot', 'get').mockReturnValue(false);
      const rename = vi.spyOn(fs, 'rename');

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir(
        '',
        `${rootPath('tmp/containerbase')} is a folder, switch it at image build time as root`,
      );
      expect(rename).not.toHaveBeenCalled();
      expect(
        (await fs.lstat(rootPath('tmp/containerbase'))).isDirectory(),
      ).toBe(true);
      expect(await pathExists(rootPath('var/cache/containerbase'))).toBe(false);
      // later calls use the default folder without warning again
      await pathSvc.ensureTmpLink();
      expect(logger.warn).toHaveBeenCalledOnce();
    });

    /** Links the default folder to the configured one, failing write checks with `code`. */
    async function linkNotWritable(code: string): Promise<void> {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase/tool.init.d');
      await fs.symlink(
        rootPath('var/cache/containerbase'),
        rootPath('tmp/containerbase'),
      );
      const { access } = fs;
      vi.spyOn(fs, 'access').mockImplementation(async (path, mode) => {
        if (mode !== undefined && mode & fs.constants.W_OK) {
          throw Object.assign(new Error(code), { code });
        }
        return await access(path, mode);
      });
    }

    test.each(['EROFS', 'EACCES'])(
      'ensureTmpLink replaces a link to a configured folder failing the write check with %s',
      async (code) => {
        await linkNotWritable(code);

        await pathSvc.ensureTmpLink();

        expectDefaultTmpDir('is not writable');
        const stats = await fs.lstat(rootPath('tmp/containerbase'));
        expect(stats.isDirectory()).toBe(true);
        expect(stats.isSymbolicLink()).toBe(false);
      },
    );

    test('ensureTmpLink keeps the default folder when the link can not be created', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      vi.spyOn(fs, 'symlink').mockRejectedValueOnce(
        Object.assign(new Error('EROFS'), { code: 'EROFS' }),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir(
        '',
        `${rootPath('tmp/containerbase')} can't be linked to it`,
      );
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    /** Fails removing the default folder with `EACCES`. */
    function failRemovingDefaultFolder(): void {
      const { rm } = fs;
      vi.spyOn(fs, 'rm').mockImplementation(async (path, options) => {
        if (path === rootPath('tmp/containerbase')) {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        }
        return await rm(path, options);
      });
    }

    test('ensureTmpLink fails when an empty default folder can not be removed', async () => {
      asRoot();
      await deleteAsync('tmp/containerbase/*', { cwd: rootPath() });
      failRemovingDefaultFolder();

      // removing it may delete entries, so it doesn't fall back
      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EACCES');

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('ensureTmpLink fails when the moved folder can not be removed', async () => {
      asRoot();
      failRemovingDefaultFolder();

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EACCES');

      expect(logger.warn).not.toHaveBeenCalled();
      expect(
        await pathExists(
          rootPath('var/cache/containerbase/tool.init.d'),
          'dir',
        ),
      ).toBe(true);
    });

    test('ensureTmpLink fails when the link can not be created after moving', async () => {
      asRoot();
      vi.spyOn(fs, 'symlink').mockRejectedValueOnce(
        Object.assign(new Error('EPERM'), { code: 'EPERM' }),
      );

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EPERM');

      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('ensureTmpLink skips entries removed by another process while moving', async () => {
      asRoot();
      await writeFile(rootPath('tmp/containerbase/tool.init.d/node'), '');
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      await pathSvc.ensureTmpLink();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink skips a default folder emptied by another process while moving', async () => {
      asRoot();
      vi.spyOn(fs, 'readdir').mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      await pathSvc.ensureTmpLink();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink rethrows other errors reading the default folder', async () => {
      asRoot();
      vi.spyOn(fs, 'readdir').mockRejectedValueOnce(
        Object.assign(new Error('EIO'), { code: 'EIO' }),
      );

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EIO');
    });

    test('ensureTmpLink keeps the default folder for a configured one which can not be resolved', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      const { realpath } = fs;
      vi.spyOn(fs, 'realpath').mockImplementation(async (path) => {
        if (path === rootPath('var/cache/containerbase')) {
          throw Object.assign(new Error('ELOOP'), { code: 'ELOOP' });
        }
        return await realpath(path);
      });

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir("can't be resolved");
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    /**
     * Lets `stat` report the configured folder as owned by root and another
     * group with `mode`, and `chown` give it to the user or fail with `error`.
     */
    function rootOwnedTmpDir(
      mode = 0o755,
      error?: Error,
    ): ReturnType<typeof vi.spyOn> {
      const { stat } = fs;
      vi.spyOn(fs, 'stat').mockImplementation(async (path) => {
        const stats = await stat(path);
        return path === rootPath('var/cache/containerbase')
          ? Object.assign(stats, {
              uid: 0,
              gid: 4242,
              mode: (stats.mode & ~0o7777) | mode,
            })
          : stats;
      });
      const chown = vi.spyOn(fs, 'chown');
      if (error) {
        chown.mockRejectedValue(error);
      } else {
        chown.mockResolvedValue();
      }
      return chown;
    }

    test('ensureTmpLink gives an empty root owned configured folder to the user as root', async () => {
      asRoot();
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase');
      await fs.chmod(rootPath('var/cache/containerbase'), 0o755);
      const chown = rootOwnedTmpDir();

      await pathSvc.ensureTmpLink();

      expect(chown).toHaveBeenCalledExactlyOnceWith(
        rootPath('var/cache/containerbase'),
        Number(env.USER_ID),
        0,
      );
      // the mode is kept
      expect(
        (await stat(rootPath('var/cache/containerbase'))).mode & fileRights,
      ).toBe(0o755);
      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test.each([
      // a new ext4 file system
      [['lost+found']],
      [['tool.init.d', 'cache', 'ipc.sock']],
    ])(
      'ensureTmpLink gives a root owned configured folder with %j to the user as root',
      async (entries) => {
        asRoot();
        await deleteAsync('tmp/containerbase', {
          force: true,
          cwd: rootPath(),
        });
        await ensurePaths(
          entries.map((entry) => `var/cache/containerbase/${entry}`),
        );
        const chown = rootOwnedTmpDir();

        await pathSvc.ensureTmpLink();

        expect(chown).toHaveBeenCalledOnce();
        expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
          rootPath('var/cache/containerbase'),
        );
      },
    );

    test.each([
      // like `/var/lib/someapp`
      [['cache', 'data', 'config']],
      [['apt']],
    ])(
      'ensureTmpLink does not own a root owned configured folder with %j as root',
      async (entries) => {
        asRoot();
        await deleteAsync('tmp/containerbase', {
          force: true,
          cwd: rootPath(),
        });
        await ensurePaths(
          entries.map((entry) => `var/cache/containerbase/${entry}`),
        );
        const chown = rootOwnedTmpDir();

        await pathSvc.ensureTmpLink();

        expect(chown).not.toHaveBeenCalled();
        expectDefaultTmpDir('is not writable for the user');
      },
    );

    test.each([true, false])(
      'ensureTmpLink does not use a shared configured folder, root %s',
      async (root) => {
        if (root) {
          asRoot();
        }
        await deleteAsync('tmp/containerbase', {
          force: true,
          cwd: rootPath(),
        });
        await ensurePaths('var/cache/containerbase');
        // like `/var/tmp`
        const chown = rootOwnedTmpDir(0o1777);

        await pathSvc.ensureTmpLink();

        expect(chown).not.toHaveBeenCalled();
        expectDefaultTmpDir('is a shared folder');
      },
    );

    test('ensureTmpLink keeps the default folder when the configured folder can not be checked', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase');
      const { stat } = fs;
      vi.spyOn(fs, 'stat').mockImplementation(async (path) => {
        if (path === rootPath('var/cache/containerbase')) {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        }
        return await stat(path);
      });

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir("can't be resolved");
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    test('ensureTmpLink does not own a root owned configured folder which can not be read as root', async () => {
      asRoot();
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase');
      const chown = rootOwnedTmpDir();
      vi.spyOn(fs, 'readdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await pathSvc.ensureTmpLink();

      expect(chown).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        {
          err: expect.objectContaining({ code: 'EACCES' }),
          tmpDir: rootPath('var/cache/containerbase'),
        },
        'can not read the tmp dir',
      );
      expectDefaultTmpDir('is not writable for the user');
    });

    test('ensureTmpLink keeps the default folder when the configured folder can not be owned as root', async () => {
      asRoot();
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase');
      const chown = rootOwnedTmpDir(
        0o755,
        Object.assign(new Error('EPERM'), { code: 'EPERM' }),
      );

      await pathSvc.ensureTmpLink();

      expect(chown).toHaveBeenCalledOnce();
      expectDefaultTmpDir('is not writable for the user');
    });

    test.each([
      [0o775, 0, undefined, true],
      [0o755, 0, undefined, false],
      [0o775, 4242, undefined, false],
      [0o777, 4242, undefined, true],
      // not 1000, which is often the test user's own group
      [0o775, 33333, undefined, false],
      [0o775, 33333, '33333', true],
    ])(
      'ensureTmpLink checks mode %o with group %i and primary group %s for the user as root',
      async (mode, gid, primaryGroupId, usable) => {
        asRoot();
        vi.stubEnv('PRIMARY_GROUP_ID', primaryGroupId);
        await deleteAsync('tmp/containerbase', {
          force: true,
          cwd: rootPath(),
        });
        await ensurePaths('var/cache/containerbase/apt');
        const { stat } = fs;
        vi.spyOn(fs, 'stat').mockImplementation(async (path) => {
          const stats = await stat(path);
          return path === rootPath('var/cache/containerbase')
            ? Object.assign(stats, {
                uid: 0,
                gid,
                mode: (stats.mode & ~0o7777) | mode,
              })
            : stats;
        });

        await pathSvc.ensureTmpLink();

        expect(logger.warn).toHaveBeenCalledTimes(usable ? 0 : 1);
      },
    );

    test('ensureTmpLink keeps the owner of a configured folder which is not root owned', async () => {
      asRoot();
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase');
      const chown = vi.spyOn(fs, 'chown');

      await pathSvc.ensureTmpLink();

      expect(chown).not.toHaveBeenCalled();
      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink keeps the default folder when the configured one is a file', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache');
      await writeFile(rootPath('var/cache/containerbase'), '');

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir('is not a directory');
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    test('ensureTmpLink keeps the default folder when the configured one is a dangling link', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache');
      await fs.symlink(
        rootPath('missing'),
        rootPath('var/cache/containerbase'),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir('is a dangling link');
      expect(await pathExists(rootPath('missing'))).toBe(false);
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    test('ensureTmpLink replaces a relative link to the unusable configured folder', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase');
      await fs.symlink(
        '../var/cache/containerbase',
        rootPath('tmp/containerbase'),
      );
      vi.spyOn(fs, 'access').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir('is not writable');
      const stats = await fs.lstat(rootPath('tmp/containerbase'));
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    test('ensureTmpLink keeps a stale link to a usable folder which can not be removed', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/other');
      await fs.symlink(rootPath('var/other'), rootPath('tmp/containerbase'));
      vi.spyOn(fs, 'rm').mockRejectedValueOnce(
        Object.assign(new Error('EPERM'), { code: 'EPERM' }),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir(
        '',
        `${rootPath('tmp/containerbase')} can't be linked to it`,
      );
      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/other'),
      );
    });

    test('ensureTmpLink fails when a dangling stale link can not be removed', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(rootPath('old'), rootPath('tmp/containerbase'));
      vi.spyOn(fs, 'rm').mockRejectedValue(
        Object.assign(new Error('EPERM'), { code: 'EPERM' }),
      );

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow(
        `${rootPath('tmp/containerbase')} links to ${rootPath('old')} which is not usable; remove the link or fix the permissions`,
      );
    });

    test('ensureTmpLink replaces a dangling stale link with a real folder when keeping the default', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(rootPath('old'), rootPath('tmp/containerbase'));
      vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir("can't be created");
      const stats = await fs.lstat(rootPath('tmp/containerbase'));
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    test('ensureTmpLink replaces a stale link to a not writable folder with a real folder when keeping the default', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/other');
      await fs.symlink(rootPath('var/other'), rootPath('tmp/containerbase'));
      vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );
      const { access } = fs;
      vi.spyOn(fs, 'access').mockImplementation(async (path, mode) => {
        if (path === rootPath('tmp/containerbase')) {
          throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
        }
        return await access(path, mode);
      });

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir("can't be created");
      const stats = await fs.lstat(rootPath('tmp/containerbase'));
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    test('ensureTmpLink does not own a configured folder resolving into tmp as root', async () => {
      asRoot();
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths(['tmp/other', 'var/cache']);
      await fs.symlink(
        rootPath('tmp/other'),
        rootPath('var/cache/containerbase'),
      );
      const chown = rootOwnedTmpDir();

      await pathSvc.ensureTmpLink();

      expect(chown).not.toHaveBeenCalled();
      expectDefaultTmpDir(`resolves into ${rootPath('tmp')}`);
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    test('ensureTmpLink does not create a missing configured folder below a link into tmp', async () => {
      vi.stubEnv('CONTAINERBASE_TMP_DIR', rootPath('var/data/containerbase'));
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var');
      await fs.symlink(rootPath('tmp'), rootPath('var/data'));

      await pathSvc.ensureTmpLink();

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        `cannot switch ${rootPath('tmp/containerbase')} to ${rootPath('var/data/containerbase')}, keeping the default folder: ${rootPath('var/data/containerbase')} resolves into ${rootPath('tmp')}`,
      );
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    test('ensureTmpLink replaces a link to the unusable configured folder with a real folder', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(
        rootPath('var/cache/containerbase'),
        rootPath('tmp/containerbase'),
      );
      vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir("can't be created");
      const stats = await fs.lstat(rootPath('tmp/containerbase'));
      expect(stats.isDirectory()).toBe(true);
      expect(stats.isSymbolicLink()).toBe(false);
    });

    test('ensureTmpLink fails when a link to the unusable configured folder can not be removed', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(
        rootPath('var/cache/containerbase'),
        rootPath('tmp/containerbase'),
      );
      vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );
      vi.spyOn(fs, 'rm').mockRejectedValueOnce(
        Object.assign(new Error('EPERM'), { code: 'EPERM' }),
      );

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow(
        `${rootPath('tmp/containerbase')} links to ${rootPath('var/cache/containerbase')} which is not usable; remove the link or fix the permissions`,
      );
    });

    test('ensureTmpLink rethrows other errors removing a link to the unusable configured folder', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(
        rootPath('var/cache/containerbase'),
        rootPath('tmp/containerbase'),
      );
      vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );
      vi.spyOn(fs, 'rm').mockRejectedValueOnce(
        Object.assign(new Error('EBUSY'), { code: 'EBUSY' }),
      );

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EBUSY');
    });

    test('ensureTmpLink keeps the default folder when the configured one can not be created', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir("can't be created");
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    test.each(['EACCES', 'EEXIST'])(
      'ensureTmpLink keeps the default folder on %s from creating the configured folder itself',
      async (code) => {
        await deleteAsync('tmp/containerbase', {
          force: true,
          cwd: rootPath(),
        });
        await ensurePaths('var/cache');
        const { mkdir } = fs;
        vi.spyOn(fs, 'mkdir').mockImplementation(async (path, options) => {
          if (path === rootPath('var/cache/containerbase')) {
            throw Object.assign(new Error(code), { code });
          }
          return await mkdir(path, options);
        });

        await pathSvc.ensureTmpLink();

        expectDefaultTmpDir("can't be created");
        expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
      },
    );

    test('ensureTmpLink rejects a configured folder resolving to the default one', async () => {
      asRoot();
      await ensurePaths('var/cache');
      await writeFile(rootPath('tmp/containerbase/tool.init.d/node'), '');
      await fs.symlink(
        rootPath('tmp/containerbase'),
        rootPath('var/cache/containerbase'),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir(`resolves into ${rootPath('tmp')}`);
      const stats = await fs.lstat(rootPath('tmp/containerbase'));
      expect(stats.isDirectory()).toBe(true);
      expect(
        await pathExists(
          rootPath('tmp/containerbase/tool.init.d/node'),
          'file',
        ),
      ).toBe(true);
    });

    test('ensureTmpLink keeps the default folder when the configured one is not writable', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache/containerbase');
      vi.spyOn(fs, 'access').mockRejectedValueOnce(
        Object.assign(new Error('EACCES'), { code: 'EACCES' }),
      );

      await pathSvc.ensureTmpLink();

      expectDefaultTmpDir('is not writable');
      expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
    });

    test.each(['EROFS', 'ENOTDIR', 'ENOENT', 'EIO'])(
      'ensureTmpLink keeps the default folder on %s creating the configured folder',
      async (code) => {
        await deleteAsync('tmp/containerbase', {
          force: true,
          cwd: rootPath(),
        });
        vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(
          Object.assign(new Error(code), { code }),
        );

        await pathSvc.ensureTmpLink();

        expectDefaultTmpDir("can't be created");
        expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
      },
    );

    test('ensureTmpLink accepts a configured folder created by another process meanwhile', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await ensurePaths('var/cache');
      const { mkdir } = fs;
      vi.spyOn(fs, 'mkdir').mockImplementation(async (path, options) => {
        if (path === rootPath('var/cache/containerbase')) {
          await mkdir(path);
          throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
        }
        return mkdir(path, options);
      });

      await pathSvc.ensureTmpLink();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink accepts the same link created by another process meanwhile', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      const { symlink } = fs;
      vi.spyOn(fs, 'symlink').mockImplementationOnce(async (target, path) => {
        await symlink(target, path);
        throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      });

      await pathSvc.ensureTmpLink();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink fails when another process created something else meanwhile', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      vi.spyOn(fs, 'symlink').mockImplementationOnce(async (_target, path) => {
        await fs.mkdir(path);
        throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      });

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EEXIST');
    });

    test('ensureTmpLink accepts a configured folder which links to a folder', async () => {
      await ensurePaths(['var/real', 'var/cache']);
      await fs.symlink(
        rootPath('var/real'),
        rootPath('var/cache/containerbase'),
      );
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });

      await pathSvc.ensureTmpLink();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink rethrows other errors removing a stale link', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(rootPath('var/other'), rootPath('tmp/containerbase'));
      vi.spyOn(fs, 'rm').mockRejectedValueOnce(
        Object.assign(new Error('EBUSY'), { code: 'EBUSY' }),
      );

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow('EBUSY');
    });

    test('ensureTmpLink creates missing parents of the configured folder', async () => {
      vi.stubEnv('CONTAINERBASE_TMP_DIR', rootPath('var/a/b/containerbase'));
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });

      await pathSvc.ensureTmpLink();

      expect(await pathExists(rootPath('var/a/b/containerbase'), 'dir')).toBe(
        true,
      );
      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/a/b/containerbase'),
      );
    });

    test('ipcSocketPath stays below the default folder', () => {
      expect(pathSvc.ipcSocketPath).toBe(
        rootPath('tmp/containerbase/ipc.sock'),
      );
    });

    test('ensureTmpLink creates the configured folder and the link', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });

      await pathSvc.ensureTmpLink();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
      await pathSvc.createDir(join(pathSvc.cachePath, '.npm'));
      expect(
        await pathExists(rootPath('var/cache/containerbase/cache/.npm'), 'dir'),
      ).toBe(true);
    });

    test('ensureTmpLink replaces a stale link', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(rootPath('var/other'), rootPath('tmp/containerbase'));

      await pathSvc.ensureTmpLink();

      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink keeps a correct link', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await fs.symlink(
        rootPath('var/cache/containerbase'),
        rootPath('tmp/containerbase'),
      );
      const rm = vi.spyOn(fs, 'rm');

      await pathSvc.ensureTmpLink();

      expect(rm).not.toHaveBeenCalled();
      expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
        rootPath('var/cache/containerbase'),
      );
    });

    test('ensureTmpLink fails for a default file', async () => {
      await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
      await writeFile(rootPath('tmp/containerbase'), '');

      await expect(pathSvc.ensureTmpLink()).rejects.toThrow(
        `${rootPath('tmp/containerbase')} is a file, remove it`,
      );
      expect((await fs.lstat(rootPath('tmp/containerbase'))).isFile()).toBe(
        true,
      );
    });
  });

  test('ensureTmpLink does nothing for the default folder with a trailing slash', async () => {
    vi.stubEnv('CONTAINERBASE_TMP_DIR', `${rootPath('tmp/containerbase')}/`);

    await pathSvc.ensureTmpLink();

    expect(pathSvc.tmpDir).toBe(pathSvc.defaultTmpDir);
    expect((await fs.lstat(rootPath('tmp/containerbase'))).isDirectory()).toBe(
      true,
    );
  });

  test('ensureTmpLink does nothing for the default folder', async () => {
    await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });

    await pathSvc.ensureTmpLink();

    expect(await pathExists(rootPath('tmp/containerbase'))).toBe(false);
  });

  test('ensureTmpLink replaces a dangling default link without a configured folder', async () => {
    await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
    await fs.symlink(rootPath('old'), rootPath('tmp/containerbase'));

    await pathSvc.ensureTmpLink();

    const stats = await fs.lstat(rootPath('tmp/containerbase'));
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('ensureTmpLink keeps a default link to a writable folder without a configured folder', async () => {
    await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
    await ensurePaths('var/other');
    await fs.symlink(rootPath('var/other'), rootPath('tmp/containerbase'));

    await pathSvc.ensureTmpLink();

    expect(await fs.readlink(rootPath('tmp/containerbase'))).toBe(
      rootPath('var/other'),
    );
  });

  test('ensureTmpLink fails when a dangling default link can not be removed', async () => {
    await deleteAsync('tmp/containerbase', { force: true, cwd: rootPath() });
    await fs.symlink(rootPath('old'), rootPath('tmp/containerbase'));
    vi.spyOn(fs, 'rm').mockRejectedValueOnce(
      Object.assign(new Error('EACCES'), { code: 'EACCES' }),
    );

    await expect(pathSvc.ensureTmpLink()).rejects.toThrow(
      `${rootPath('tmp/containerbase')} links to ${rootPath('old')} which is not usable; remove the link or fix the permissions`,
    );
  });

  test('ensureBasePaths: throws when the system is not initialized', async () => {
    await deleteAsync('var', { force: true, dot: true, cwd: rootPath() });

    await expect(pathSvc.ensureBasePaths()).rejects.toThrow(
      'System not initialized for containerbase',
    );
  });

  describe('ensureWritable', () => {
    /** Lets `fs.access` fail with the error code for the path only. */
    function failAccess(path: string, code: string): void {
      vi.spyOn(fs, 'access').mockImplementation((p) =>
        p === path
          ? Promise.reject(Object.assign(new Error(code), { code }))
          : Promise.resolve(),
      );
    }

    test('passes for writable and missing folders', async () => {
      // nothing below `/opt/containerbase` exists yet
      await expect(pathSvc.ensureWritable()).resolves.toBeUndefined();

      await pathSvc.ensureBasePaths();
      await expect(
        pathSvc.ensureWritable(pathSvc.varPath),
      ).resolves.toBeUndefined();
    });

    test('throws on a read-only file system', async () => {
      failAccess(pathSvc.toolsPath, 'EROFS');

      await expect(pathSvc.ensureWritable()).rejects.toThrow(
        expect.objectContaining({
          message: `EROFS: can't write to ${pathSvc.toolsPath}, the file system is read-only. Install tools at image build time or mount the containerbase folders writable.`,
          code: 'EROFS',
          cause: expect.objectContaining({ code: 'EROFS' }),
        }),
      );
    });

    test('checks the nearest existing parent of a missing folder', async () => {
      const parent = dirname(pathSvc.toolsPath);
      vi.spyOn(fs, 'access').mockImplementation((p) => {
        const code =
          p === pathSvc.toolsPath ? 'ENOENT' : p === parent ? 'EROFS' : null;
        return code
          ? Promise.reject(Object.assign(new Error(code), { code }))
          : Promise.resolve();
      });

      await expect(
        pathSvc.ensureWritableDirs(pathSvc.toolsPath),
      ).rejects.toThrow(
        `EROFS: can't write to ${pathSvc.toolsPath}, the file system is read-only.`,
      );
    });

    test('passes when no parent of a missing folder exists', async () => {
      vi.spyOn(fs, 'access').mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      await expect(
        pathSvc.ensureWritableDirs(pathSvc.toolsPath),
      ).resolves.toBeUndefined();
    });

    test('checks only the given folders', async () => {
      failAccess(pathSvc.toolsPath, 'EROFS');

      await expect(
        pathSvc.ensureWritableDirs(pathSvc.binDir),
      ).resolves.toBeUndefined();
      // files can only be created with write and search permission
      expect(fs.access).toHaveBeenCalledExactlyOnceWith(
        pathSvc.binDir,
        fs.constants.W_OK | fs.constants.X_OK,
      );
    });

    test('throws when the current user may not write', async () => {
      failAccess(pathSvc.varPath, 'EACCES');

      await expect(pathSvc.ensureWritable(pathSvc.varPath)).rejects.toThrow(
        expect.objectContaining({
          message: `EACCES: can't write to ${pathSvc.varPath}, the current user has no write permission. Run as root or as the user owning the folder.`,
          code: 'EACCES',
          cause: expect.objectContaining({ code: 'EACCES' }),
        }),
      );
    });
  });

  test('findPreparedTools', async () => {
    expect(await pathSvc.findPreparedTools()).toEqual([]);

    await pathSvc.setPrepared('node');
    await pathSvc.setPrepared('bun');

    // `readdir` order is filesystem dependent, so compare without it
    expect((await pathSvc.findPreparedTools()).toSorted()).toEqual([
      'bun',
      'node',
    ]);
  });

  test('findLegacyTools', async () => {
    // no v2 folder, eg. when running from the repository
    expect(await pathSvc.findLegacyTools()).toEqual([]);

    await ensurePaths('usr/local/containerbase/tools/v2');
    await writeFile(rootPath('usr/local/containerbase/tools/v2/leg.sh'), '');
    await writeFile(rootPath('usr/local/containerbase/tools/v2/readme'), '');
    expect(await pathSvc.findLegacyTools()).toEqual(['leg']);
  });

  test('isLegacyTool', async () => {
    await ensurePaths([
      'usr/local/containerbase/tools',
      'usr/local/containerbase/tools/v2',
    ]);

    expect(await pathSvc.isLegacyTool('leg')).toBe(false);
    expect(await pathSvc.isLegacyTool('leg', true)).toBe(false);

    await writeFile(rootPath('usr/local/containerbase/tools/leg.sh'), '');
    expect(await pathSvc.isLegacyTool('leg')).toBe(false);
    expect(await pathSvc.isLegacyTool('leg', true)).toBe(true);

    await writeFile(rootPath('usr/local/containerbase/tools/v2/leg.sh'), '');
    expect(await pathSvc.isLegacyTool('leg')).toBe(true);
  });

  test('exportToolEnvContent', async () => {
    await mkdir(`${pathSvc.installDir}/tools`, { recursive: true });

    await pathSvc.exportToolEnvContent(
      'node',
      'export NODE_VERSION=v14.17.0\n',
    );
    const s = await stat(`${pathSvc.installDir}/tools/node/env.sh`);
    expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o644);
    expect(
      await readFile(`${pathSvc.installDir}/tools/node/env.sh`, 'utf8'),
    ).toBe('\nexport NODE_VERSION=v14.17.0\n');
  });

  test('versionedToolPath', () => {
    expect(pathSvc.versionedToolPath('node', '18.0.1')).toBe(
      rootPath('opt/containerbase/tools/node/18.0.1'),
    );
  });

  test('creates and finds tool paths', async () => {
    await mkdir(rootPath('opt/containerbase/tools'), { recursive: true });
    expect(await pathSvc.findToolPath('node')).toBeNull();
    await pathSvc.createToolPath('node');
    expect(await pathSvc.findToolPath('node')).toBe(
      rootPath('opt/containerbase/tools/node'),
    );
    expect(await pathSvc.findVersionedToolPath('node', '18.0.1')).toBeNull();
    await pathSvc.createVersionedToolPath('node', '18.0.1');
    expect(await pathSvc.findVersionedToolPath('node', '18.0.1')).toBe(
      rootPath('opt/containerbase/tools/node/18.0.1'),
    );
  });

  test('createVersionedToolPath with sub folders', async () => {
    await ensurePaths('opt/containerbase/tools');

    const path = await pathSvc.createVersionedToolPath(
      'jb',
      '0.6.0',
      'lib',
      'bin',
    );

    expect(path).toBe(rootPath('opt/containerbase/tools/jb/0.6.0/lib/bin'));
    // tests don't run as root, so the umask is group writable
    const mode = platform() === 'win32' ? 0 : 0o775;
    expect((await stat(path)).mode & fileRights).toBe(mode);
    expect((await stat(join(path, '..'))).mode & fileRights).toBe(mode);
    // an existing folder is fine
    await expect(
      pathSvc.createVersionedToolPath('jb', '0.6.0', 'lib', 'bin'),
    ).resolves.toBe(path);
  });

  test('exportEnv', async () => {
    await mkdir(rootPath('usr/local/etc'), { recursive: true });
    await pathSvc.exportEnv({ NODE_VERSION: 'v14.17.1' });
    await pathSvc.exportEnv({ TEST: '/tmp/test' }, true);

    expect(env).toMatchObject({ NODE_VERSION: 'v14.17.1' });
    const content = await readFile(rootPath('usr/local/etc/env'), 'utf8');
    expect(content).toContain('export NODE_VERSION=${NODE_VERSION-v14.17.1}\n');
    expect(content).toContain(
      'if [ "${EUID}" != 0 ]; then\nexport TEST=${TEST-/tmp/test}\nfi\n',
    );
  });

  test('exportPath', async () => {
    await mkdir(rootPath('usr/local/etc'), { recursive: true });
    await pathSvc.exportPath('/some/path');

    expect(env).toMatchObject({ PATH: `/some/path:${path}` });
    const content = await readFile(rootPath('usr/local/etc/env'), 'utf8');
    expect(content).toContain('export PATH=/some/path:$PATH\n');
  });

  describe('exportToolEnv', () => {
    test('node', async () => {
      await mkdir(`${pathSvc.installDir}/tools`, { recursive: true });
      await pathSvc.exportToolEnv('node', { NODE_VERSION: 'v14.17.0' });
      await pathSvc.exportToolEnv('node', { TEST: '/tmp/test' }, true);
      expect(env).toMatchObject({
        NODE_VERSION: 'v14.17.0',
      });

      const s = await stat(`${pathSvc.installDir}/tools/node/env.sh`);

      expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o664);

      await pathSvc.resetToolEnv('node');
      await expect(
        stat(`${pathSvc.installDir}/tools/node/env.sh`),
      ).rejects.toThrow('ENOENT');
    });

    test('node with NODE_OPTIONS', async () => {
      await mkdir(`${pathSvc.installDir}/tools`, { recursive: true });
      await pathSvc.exportToolEnv('node', {
        NODE_VERSION: 'v14.17.0',
        NODE_OPTIONS: '--use-openssl-ca',
      });

      const contents = (
        await readFile(`${pathSvc.installDir}/tools/node/env.sh`)
      ).toString();

      expect(contents).toContain(
        'export NODE_OPTIONS=${NODE_OPTIONS---use-openssl-ca}',
      );
    });
  });

  describe('exportToolPath', () => {
    test('node', async () => {
      await mkdir(`${pathSvc.installDir}/tools`, { recursive: true });
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

  test('ensureToolPath', async () => {
    await mkdir(rootPath('opt/containerbase/tools'), { recursive: true });
    expect(await pathSvc.ensureToolPath('node')).toBe(
      rootPath('opt/containerbase/tools/node'),
    );
    expect(
      await pathExists(rootPath('opt/containerbase/tools/node'), 'dir'),
    ).toBe(true);
  });

  test('fileExists', async () => {
    expect(await pathSvc.fileExists(rootPath('usr/local/etc/env123'))).toBe(
      false,
    );
  });

  test('createDir', async () => {
    const dir = rootPath('env123/sub');
    expect(await pathSvc.createDir(dir)).toBeUndefined();

    const s = await stat(dir);
    expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o775);
    expect(await pathSvc.createDir(dir)).toBeUndefined();
  });

  test('createDir: keeps a link to a folder', async () => {
    const dir = rootPath('env123/dir');
    const link = rootPath('env123/link');
    await pathSvc.createDir(dir);
    await fs.symlink(dir, link);

    expect(await pathSvc.createDir(link)).toBeUndefined();
    expect(await pathSvc.createDir(join(link, 'sub'))).toBeUndefined();

    expect(await fs.readlink(link)).toBe(dir);
    expect(await pathExists(join(dir, 'sub'), 'dir')).toBe(true);
  });

  test('createDir: throws when the path is no folder', async () => {
    const file = rootPath('env123/file');
    const fileLink = rootPath('env123/file-link');
    const dangling = rootPath('env123/dangling');
    await pathSvc.createDir(rootPath('env123'));
    await writeFile(file, '');
    await fs.symlink(file, fileLink);
    await fs.symlink(rootPath('env123/missing'), dangling);

    await expect(pathSvc.createDir(file)).rejects.toThrow(
      `Path exists and is not a directory: ${file}`,
    );
    await expect(pathSvc.createDir(fileLink)).rejects.toThrow(
      `Path exists and is not a directory: ${fileLink}`,
    );
    await expect(pathSvc.createDir(dangling)).rejects.toThrow(
      `Path exists and is not a directory: ${dangling}`,
    );
  });

  test('createSymlink', async () => {
    const target = rootPath('env123/target');
    const link = rootPath('env123/link');
    await pathSvc.createDir(rootPath('env123'));
    await writeFile(target, '');

    expect(await pathSvc.createSymlink(target, link)).toBeUndefined();

    expect(await fs.readlink(link)).toBe(target);
  });

  test('createSymlink: keeps an existing link', async () => {
    const target = rootPath('env123/target');
    const link = rootPath('env123/link');
    await pathSvc.createDir(rootPath('env123'));
    await writeFile(target, '');
    await pathSvc.createSymlink(target, link);

    await expect(pathSvc.createSymlink(target, link)).resolves.toBeUndefined();

    expect(await fs.readlink(link)).toBe(target);
  });

  test('createSymlink: keeps an existing folder', async () => {
    const target = rootPath('env123/target');
    const dir = rootPath('env123/dir');
    await pathSvc.createDir(dir);

    await pathSvc.createSymlink(target, dir);

    expect((await stat(dir)).isDirectory()).toBe(true);
  });

  test('createSymlink: keeps a dangling link', async () => {
    const target = rootPath('env123/missing');
    const link = rootPath('env123/link');
    await pathSvc.createDir(rootPath('env123'));
    await fs.symlink(target, link);

    await pathSvc.createSymlink(rootPath('env123/other'), link);

    expect(await fs.readlink(link)).toBe(target);
  });

  test('toolInit', async () => {
    expect(pathSvc.toolInitPath('node')).toBe(
      rootPath('tmp/containerbase/tool.init.d/node'),
    );
    expect(await pathSvc.isInitialized('node')).toBe(false);
    await pathSvc.setInitialized('node');
    expect(await pathSvc.isInitialized('node')).toBe(true);
  });

  test('toolPrepare', async () => {
    expect(pathSvc.toolPreparePath('node')).toBe(
      rootPath('var/lib/containerbase/tool.prep.d/node'),
    );
    expect(await pathSvc.isPrepared('node')).toBe(false);
    await pathSvc.setPrepared('node');
    expect(await pathSvc.isPrepared('node')).toBe(true);
  });

  test('setOwner: chowns root owned paths when running as root', async () => {
    const file = rootPath('owned');
    await writeFile(file, 'test');
    // the file belongs to the user running the tests, so report it as root
    // owned instead
    const stats = await stat(file);
    stats.uid = 0;
    vi.spyOn(fs, 'stat').mockResolvedValueOnce(stats);
    vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);
    const chown = vi.spyOn(fs, 'chown').mockResolvedValue();

    await pathSvc.setOwner({ path: file });

    expect(chown).toHaveBeenCalledExactlyOnceWith(file, 12021, 0);
  });

  describe('withTempDir', () => {
    test('returns the result and removes the folder afterwards', async () => {
      let dirInFn: string | undefined;
      let existedInFn = false;

      const result = await pathSvc.withTempDir('test-', async (dir) => {
        dirInFn = dir;
        existedInFn = await pathExists(dir, 'dir');
        return 'result';
      });

      expect(result).toBe('result');
      expect(existedInFn).toBe(true);
      expect(await pathExists(dirInFn!, 'dir')).toBe(false);
    });

    test('removes the folder when fn throws', async () => {
      let dirInFn: string | undefined;

      await expect(
        pathSvc.withTempDir('test-', (dir) => {
          dirInFn = dir;
          return Promise.reject(new Error('test error'));
        }),
      ).rejects.toThrow('test error');

      expect(await pathExists(dirInFn!, 'dir')).toBe(false);
    });
  });

  test('writeFile', async () => {
    const file = rootPath('env123');
    await pathSvc.writeFile(file, 'test');

    const s = await stat(file);
    expect(s.mode & fileRights).toBe(platform() === 'win32' ? 0 : 0o664);
    expect(await readFile(file, 'utf8')).toBe('test');
  });
});
