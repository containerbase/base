import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { rootPath } from '../../../test/path';
import { PathService, rootContainer } from '../services';
import { initializeTools, prepareTools } from '.';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');

vi.mock('node:process', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  geteuid: () => 0,
}));

describe('index', () => {
  beforeAll(async () => {
    for (const p of [
      'var/lib/containerbase/tool.prep.d',
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools/v2',
    ]) {
      const prepDir = rootPath(p);
      await fs.mkdir(prepDir, {
        recursive: true,
      });
    }

    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/dummy.sh'),
      '',
    );

    const child = rootContainer.createChild();
    const pathSvc = child.get(PathService);
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
