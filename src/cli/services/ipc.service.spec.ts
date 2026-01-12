import { beforeAll, describe, expect, test } from 'vitest';
import { ensurePaths, rootPath } from '../../../test/path';
import { logger } from '../utils';
import { IpcClient, createContainer } from '.';

describe('cli/services/ipc.service', async () => {
  const child = createContainer();
  const svc = await child.getAsync(IpcClient);

  beforeAll(async () => {
    await ensurePaths('tmp/containerbase');
  });

  test('throws', async () => {
    await expect(svc.start()).rejects.toThrow(
      `connect ENOENT ${rootPath('tmp/containerbase/ipc.sock')}`,
    );
    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: expect.any(Error) },
      'ipc client error',
    );
  });
});
