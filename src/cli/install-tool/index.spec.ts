import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { rootPath } from '../../../test/path';
import { installTool, resolveVersion } from '.';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun');
vi.mock('../tools/php/composer');

describe('cli/install-tool/index', () => {
  beforeAll(async () => {
    for (const p of [
      'var/lib/containerbase/tool.prep.d',
      'tmp/containerbase/tool.init.d',
    ]) {
      const prepDir = rootPath(p);
      await fs.mkdir(prepDir, {
        recursive: true,
      });
    }
  });

  test('installTool', async () => {
    expect(await installTool('bun', '1.0.0')).toBeUndefined();
    expect(await installTool('dummy', '1.0.0')).toBeUndefined();
  });

  test('resolveVersion', async () => {
    expect(await resolveVersion('composer', '1.0.0')).toBe('1.0.0');
  });
});
