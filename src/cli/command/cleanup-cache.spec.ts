import { describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { testCli } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  cleanupCache: vi.fn(),
}));

vi.mock('../cleanup/index.ts', () => mocks);

describe('cli/command/cleanup-cache', () => {
  test('works', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupCache.mockResolvedValueOnce(['/tmp/a', '/tmp/b']);

    expect(await cli.run(['cleanup', 'cache'])).toBe(0);

    expect(mocks.cleanupCache).toHaveBeenCalledExactlyOnceWith(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup cache succeeded'),
    );
  });

  test('dry run', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupCache.mockResolvedValueOnce(['/tmp/a']);

    expect(await cli.run(['cleanup', 'cache', '-d'])).toBe(0);

    expect(mocks.cleanupCache).toHaveBeenCalledExactlyOnceWith(true);
  });

  test('fails', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupCache.mockRejectedValueOnce(new Error('test'));

    expect(await cli.run(['cleanup', 'cache'])).toBe(1);

    expect(logger.error).toHaveBeenCalledWith('test');
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup cache failed'),
    );

    // a rejection which is not an `Error` has no message to report
    mocks.cleanupCache.mockRejectedValueOnce('boom');
    expect(await cli.run(['cleanup', 'cache'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');
  });
});
