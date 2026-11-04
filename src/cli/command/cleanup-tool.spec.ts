import { describe, expect, test, vi } from 'vitest';
import { NotSupported } from '../utils/codes.ts';
import { logger } from '../utils/index.ts';
import { testCli } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  cleanupTools: vi.fn(),
}));

vi.mock('../cleanup/index.ts', () => mocks);

describe('cli/command/cleanup-tool', () => {
  test('works', async () => {
    const cli = testCli('containerbase-cli');

    expect(await cli.run(['cleanup', 'tool'])).toBe(0);
    expect(mocks.cleanupTools).toHaveBeenCalledExactlyOnceWith(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup tool succeeded'),
    );

    expect(await cli.run(['cleanup', 'tool', '--dry-run'])).toBe(0);
    expect(mocks.cleanupTools).toHaveBeenLastCalledWith(true);
  });

  test('fails', async () => {
    const cli = testCli('containerbase-cli');

    // a non-zero exit code from the cleanup is reported as a failure
    mocks.cleanupTools.mockResolvedValueOnce(NotSupported);
    expect(await cli.run(['cleanup', 'tool'])).toBe(NotSupported);
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup tool failed'),
    );

    mocks.cleanupTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['cleanup', 'tool'])).toBe(1);
    expect(logger.error).toHaveBeenCalledWith('test');

    // a rejection which is not an `Error` has no message to report
    mocks.cleanupTools.mockRejectedValueOnce('boom');
    expect(await cli.run(['cleanup', 'tool'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');
  });
});
