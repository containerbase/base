import type { Container } from 'inversify';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import {
  IpcClient,
  IpcServer,
  LinkToolService,
  createContainer,
} from './index.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

describe('cli/services/ipc.service', async () => {
  const child: Container = createContainer();
  const svc = await child.getAsync(IpcClient);

  beforeAll(async () => {
    await ensurePaths(['tmp/containerbase', 'opt/containerbase/bin']);
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

  test('the client can only be started once', async () => {
    // the failed connect above left the client marked as running
    await expect(svc.start()).rejects.toThrow('ipc client already started');

    svc.stop();
    expect(() => svc.stop()).toThrow('ipc client not started');
  });

  test('links a tool over ipc', async () => {
    const server = await child.getAsync(IpcServer);
    await server.start();

    try {
      await expect(server.start()).rejects.toThrow(
        'ipc server already started',
      );
      expect(await svc.hasServer()).toBe(true);
      await svc.start();

      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      expect(await svc.linkTool('bun', { srcDir: '/bin/bash' })).toBe(0);
      expect(spy).toHaveBeenCalledExactlyOnceWith('bun', {
        srcDir: '/bin/bash',
      });

      spy.mockRejectedValueOnce(new Error('link failed'));
      expect(await svc.linkTool('bun', { srcDir: '/bin/bash' })).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'ipc link-tool error',
      );
    } finally {
      svc.stop();
      server.stop();
    }

    expect(() => server.stop()).toThrow('ipc server not started');
    expect(await svc.hasServer()).toBe(false);
  });
});
