import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';

const mocks = vi.hoisted(() => ({
  deleteAsync: vi.fn(),
}));

vi.mock('del', () => mocks);

describe('cli/command/cleanup-path', () => {
  test('works', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);

    expect(
      await cli.run(['cleanup', 'path', '/tmp/**:/var/tmp', '/some/path/**']),
    ).toBe(0);

    expect(mocks.deleteAsync).toHaveBeenCalledExactlyOnceWith(
      ['/tmp/**', '/var/tmp', '/some/path/**'],
      { dot: true },
    );

    mocks.deleteAsync.mockRejectedValueOnce(new Error('test'));
    expect(
      await cli.run(['cleanup', 'path', '/tmp/**:/var/tmp', '/some/path/**']),
    ).toBe(1);

    // a rejection which is not an `Error` has no message to report
    mocks.deleteAsync.mockRejectedValueOnce('boom');
    expect(
      await cli.run(['cleanup', 'path', '/tmp/**:/var/tmp', '/some/path/**']),
    ).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');
  });
});
