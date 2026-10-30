import fs from 'node:fs/promises';
import { execa } from 'execa';
import { describe, expect, test, vi } from 'vitest';
import { cliMode, move } from './index.ts';
import { rootPath } from '~test/path.ts';

const procMocks = vi.hoisted(() => ({ argv0: '', env: {} }));
vi.mock('node:process', () => procMocks);
vi.mock('execa');

describe('cli/utils/index', () => {
  test('cliMode', async () => {
    expect(cliMode()).toBeNull();
    procMocks.argv0 = 'containerbase-cli';
    expect((await import('./index.ts')).cliMode()).toBe('containerbase-cli');
    procMocks.argv0 = 'install-gem';
    expect((await import('./index.ts')).cliMode()).toBe('install-gem');
    procMocks.argv0 = 'install-npm';
    expect((await import('./index.ts')).cliMode()).toBe('install-npm');
    procMocks.argv0 = 'install-pip';
    expect((await import('./index.ts')).cliMode()).toBe('install-pip');
    procMocks.argv0 = 'install-tool';
    expect((await import('./index.ts')).cliMode()).toBe('install-tool');
    procMocks.argv0 = 'prepare-tool';
    expect((await import('./index.ts')).cliMode()).toBe('prepare-tool');
    procMocks.argv0 = '/usr/bin/node';
    expect((await import('./index.ts')).cliMode()).toBe('containerbase-cli');
    procMocks.argv0 = '/bin/sh';
    expect((await import('./index.ts')).cliMode()).toBeNull();
  });

  describe('move', () => {
    test('renames', async () => {
      await fs.writeFile(rootPath('move-src'), 'a');

      await move(rootPath('move-src'), rootPath('move-dst'));

      expect(await fs.readFile(rootPath('move-dst'), 'utf8')).toBe('a');
      expect(execa).not.toHaveBeenCalled();
    });

    test('uses mv across devices', async () => {
      vi.spyOn(fs, 'rename').mockRejectedValueOnce(
        Object.assign(new Error('EXDEV'), { code: 'EXDEV' }),
      );

      await move('/a', '/b');

      expect(execa).toHaveBeenCalledExactlyOnceWith(
        'mv',
        ['/a', '/b'],
        expect.objectContaining({ preferLocal: false }),
      );
    });

    test('rethrows other errors', async () => {
      await expect(
        move(rootPath('move-missing'), rootPath('move-dst2')),
      ).rejects.toThrow('ENOENT');
      expect(execa).not.toHaveBeenCalled();
    });
  });
});
