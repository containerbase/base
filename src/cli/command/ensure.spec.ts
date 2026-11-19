import { describe, expect, test, vi } from 'vitest';
import { CommandNotFound } from '../utils/codes.ts';
import { logger } from '../utils/index.ts';
import { testCli } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  ensureTool: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);

describe('cli/command/ensure', () => {
  test('ensure', async () => {
    const cli = testCli(null);

    expect(await cli.run(['ensure', 'node'])).toBe(0);
    expect(mocks.ensureTool).toHaveBeenCalledExactlyOnceWith('node');

    // the exit code of the restore is the exit code of the command
    mocks.ensureTool.mockResolvedValueOnce(CommandNotFound);
    expect(await cli.run(['ensure', 'node'])).toBe(CommandNotFound);

    mocks.ensureTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['ensure', 'node'])).toBe(1);
    expect(logger.error).toHaveBeenCalledWith('test');

    // a rejection which is not an `Error` has no message to report
    mocks.ensureTool.mockRejectedValueOnce('boom');
    expect(await cli.run(['ensure', 'node'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');
  });
});
