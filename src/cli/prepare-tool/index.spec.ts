import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { PathService, createContainer } from '../services/index.ts';
import { RubyPrepareService } from '../tools/ruby/index.ts';
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
});
