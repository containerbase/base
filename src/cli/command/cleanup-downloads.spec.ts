import { describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { testCli } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  cleanupDownloads: vi.fn(),
}));

vi.mock('../cleanup/index.ts', () => mocks);

describe('cli/command/cleanup-downloads', () => {
  test('works', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupDownloads.mockResolvedValueOnce(['/cache/a', '/cache/b']);

    expect(await cli.run(['cleanup', 'downloads'])).toBe(0);

    expect(mocks.cleanupDownloads).toHaveBeenCalledExactlyOnceWith(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup downloads succeeded'),
    );
  });

  test('dry run', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupDownloads.mockResolvedValueOnce(['/cache/a']);

    expect(await cli.run(['cleanup', 'downloads', '-d'])).toBe(0);

    expect(mocks.cleanupDownloads).toHaveBeenCalledExactlyOnceWith(true);
  });

  test('fails', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupDownloads.mockRejectedValueOnce(new Error('test'));

    expect(await cli.run(['cleanup', 'downloads'])).toBe(1);

    expect(logger.error).toHaveBeenCalledWith('test');
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup downloads failed'),
    );

    // a rejection which is not an `Error` has no message to report
    mocks.cleanupDownloads.mockRejectedValueOnce('boom');
    expect(await cli.run(['cleanup', 'downloads'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');
  });
});
