import { describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { testCli } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  cleanupAll: vi.fn(),
  cleanupCache: vi.fn(),
  cleanupDownloads: vi.fn(),
  cleanupTools: vi.fn(),
}));

const del = vi.hoisted(() => ({ deleteAsync: vi.fn() }));

vi.mock('../cleanup/index.ts', () => mocks);
vi.mock('del', () => del);

describe('cli/command/cleanup', () => {
  test('works', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupAll.mockResolvedValueOnce(0);

    expect(await cli.run(['cleanup'])).toBe(0);

    expect(mocks.cleanupAll).toHaveBeenCalledExactlyOnceWith(false);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup succeeded'),
    );
  });

  test('dry run', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupAll.mockResolvedValueOnce(0);

    expect(await cli.run(['cleanup', '--dry-run'])).toBe(0);

    expect(mocks.cleanupAll).toHaveBeenCalledExactlyOnceWith(true);
  });

  test('fails', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupAll.mockResolvedValueOnce(2);

    expect(await cli.run(['cleanup'])).toBe(2);

    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup failed'),
    );
  });

  test('fails when the cleanups cannot start', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupAll.mockRejectedValueOnce(new Error('not writable'));

    expect(await cli.run(['cleanup'])).toBe(1);

    expect(logger.error).toHaveBeenCalledWith('not writable');
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup failed'),
    );

    // a rejection which is not an `Error` has no message to report
    mocks.cleanupAll.mockRejectedValueOnce('boom');
    expect(await cli.run(['cleanup'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');
  });

  test('keeps the sub commands', async () => {
    const cli = testCli('containerbase-cli');
    mocks.cleanupCache.mockResolvedValue([]);
    mocks.cleanupDownloads.mockResolvedValue([]);

    expect(await cli.run(['cleanup', 'cache'])).toBe(0);
    expect(await cli.run(['cleanup', 'downloads'])).toBe(0);
    expect(await cli.run(['cleanup', 'tool'])).toBe(0);
    expect(await cli.run(['cleanup', 'path', '/tmp/a'])).toBe(0);

    expect(mocks.cleanupCache).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.cleanupDownloads).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.cleanupTools).toHaveBeenCalledExactlyOnceWith(false);
    expect(del.deleteAsync).toHaveBeenCalledExactlyOnceWith(['/tmp/a'], {
      dot: true,
    });
    expect(mocks.cleanupAll).not.toHaveBeenCalled();
  });
});
