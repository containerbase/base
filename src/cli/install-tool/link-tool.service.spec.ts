import fs from 'node:fs/promises';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { ensurePaths } from '../../../test/path';
import { createContainer } from '../services';
import { LinkToolService } from './link-tool.service';

describe('cli/install-tool/link-tool.service', async () => {
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
});
