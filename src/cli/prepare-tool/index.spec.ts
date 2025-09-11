import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { PathService, createContainer } from '../services';
import { initializeTools, prepareTools } from '.';
import { ensurePaths, rootPath } from '~test/path';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  geteuid: () => 0,
}));

describe('cli/prepare-tool/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'var/lib/containerbase/tool.prep.d',
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools/v2',
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

  test('initializeTools', async () => {
    expect(await initializeTools(['bun', 'dummy'])).toBeUndefined();
    expect(await initializeTools(['not-exist'])).toBeUndefined();
    expect(await initializeTools(['all'])).toBeUndefined();
  });
});
