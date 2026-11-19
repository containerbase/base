import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  DataService,
  PathService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { RubyPrepareService } from '../tools/ruby/index.ts';
import { logger, pathExists } from '../utils/index.ts';
import { initializeTools, prepareTools } from './index.ts';
import { V2ToolPrepareService } from './prepare-legacy-tools.service.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun.ts');
vi.mock('../tools/php/composer.ts');

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  geteuid: () => 0,
}));

describe('cli/prepare-tool/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools/v2',
      'var/lib/containerbase/tool.prep.d',
    ]);

    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/dummy.sh'),
      '',
    );

    const child = createContainer();
    const pathSvc = await child.getAsync(PathService);
    await pathSvc.setPrepared('bun');
  });

  test('prepareTools', async () => {
    expect(await prepareTools(['bun', 'dummy'])).toBeUndefined();
    expect(await prepareTools(['not-exist'])).toBe(1);
  });

  test('prefers a modern service over a v2 shell tool with the same name', async () => {
    const script = rootPath('usr/local/containerbase/tools/v2/ruby.sh');
    await fs.writeFile(script, '');
    const ruby = vi
      .spyOn(RubyPrepareService.prototype, 'prepare')
      .mockResolvedValue();
    const v2 = vi.spyOn(V2ToolPrepareService.prototype, 'prepare');
    // keep ruby unprepared, so later tests don't initialize it
    vi.spyOn(PathService.prototype, 'setPrepared').mockResolvedValue();

    try {
      expect(await prepareTools(['ruby'])).toBeUndefined();
    } finally {
      await fs.rm(script);
    }

    expect(ruby).toHaveBeenCalledOnce();
    expect(v2).not.toHaveBeenCalled();
  });

  test('initializeTools', async () => {
    expect(await initializeTools(['bun', 'dummy'])).toBeUndefined();
    expect(await initializeTools(['not-exist'])).toBeUndefined();
    expect(await initializeTools(['all'])).toBeUndefined();
  });

  describe('pointers', () => {
    const tool = { name: 'ptr', version: '1.0.0' };

    /** Links the commands to the tool version and writes their wrappers. */
    async function linkCommands(...names: string[]): Promise<void> {
      const verSvc = await createContainer().getAsync(VersionService);
      const wrappers = rootPath('opt/containerbase/tools/ptr/1.0.0/.wrappers');
      await fs.mkdir(wrappers, { recursive: true });
      for (const name of names) {
        await verSvc.setLink({ name, tool });
        await fs.writeFile(join(wrappers, name), '');
      }
    }

    test('init tool all recreates the missing ones', async () => {
      await linkCommands('ptr-a', 'ptr-b');
      // a command of a tool without wrappers, like a v2 shell tool
      const verSvc = await createContainer().getAsync(VersionService);
      await verSvc.setLink({
        name: 'ptr-legacy',
        tool: { ...tool, name: 'x' },
      });
      const links = rootPath('opt/containerbase/links');
      await ensurePaths('opt/containerbase/links');
      await fs.symlink('/not/existing', join(links, 'ptr-a'));
      const wrapperB = rootPath(
        'opt/containerbase/tools/ptr/1.0.0/.wrappers/ptr-b',
      );
      await fs.symlink(wrapperB, join(links, 'ptr-b'));
      const spy = vi.spyOn(fs, 'symlink');

      expect(await initializeTools(['all'])).toBeUndefined();

      // the dangling pointer is fixed, the valid one is left alone
      expect(await fs.readlink(join(links, 'ptr-a'))).toBe(
        rootPath('opt/containerbase/tools/ptr/1.0.0/.wrappers/ptr-a'),
      );
      expect(await fs.readlink(join(links, 'ptr-b'))).toBe(wrapperB);
      expect(spy).toHaveBeenCalledOnce();
      expect(await pathExists(join(links, 'ptr-legacy'))).toBe(false);
    });

    test('init tool all only warns when a pointer cannot be written', async () => {
      await linkCommands('ptr-c');
      vi.spyOn(fs, 'symlink').mockRejectedValue(new Error('EROFS'));

      expect(await initializeTools(['all'])).toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        { err: expect.any(Error), command: 'ptr-c' },
        'cannot restore the pointer',
      );
    });

    test('init tool all only reads the databases', async () => {
      const spy = vi.spyOn(DataService.prototype, 'readOnly');

      expect(await initializeTools(['all'])).toBeUndefined();

      expect(spy).toHaveBeenCalledOnce();
    });

    test('init tool all only warns when the links cannot be read', async () => {
      const err = new Error('unreadable');
      vi.spyOn(VersionService.prototype, 'findAllLinks').mockRejectedValue(err);

      expect(await initializeTools(['all'])).toBeUndefined();

      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { err },
        'cannot restore the pointers',
      );
    });

    test('init tool of a single tool leaves the pointers', async () => {
      await linkCommands('ptr-d');
      const spy = vi.spyOn(fs, 'symlink');

      expect(await initializeTools(['bun'])).toBeUndefined();
      expect(await initializeTools(['all'], true)).toBeUndefined();

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
