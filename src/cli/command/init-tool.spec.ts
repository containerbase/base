import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
  initializeTools: vi.fn(),
  restoreInstallDir: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);
vi.mock('../prepare-tool/index.ts', () => mocks);

describe('cli/command/init-tool', () => {
  test('init-tool', async () => {
    const cli = new Cli({ binaryName: 'cli' });
    registerCommands(cli, null);

    expect(await cli.run(['init', 'tool', 'node'])).toBe(0);
    expect(mocks.initializeTools).toHaveBeenCalledExactlyOnceWith(
      ['node'],
      false,
    );

    mocks.initializeTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['init', 'tool', 'node'])).toBe(1);

    // a rejection which is not an `Error` has no message to report
    mocks.initializeTools.mockRejectedValueOnce('boom');
    expect(await cli.run(['init', 'tool', 'node'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.fatal).not.toHaveBeenCalledWith('boom');
  });

  test('restores the install dir first', async () => {
    const cli = new Cli({ binaryName: 'cli' });
    registerCommands(cli, null);

    expect(await cli.run(['init', 'tool', 'all'])).toBe(0);
    expect(mocks.restoreInstallDir).toHaveBeenCalledOnce();

    // the tools are initialized anyway
    mocks.restoreInstallDir.mockRejectedValueOnce(new Error('EROFS'));
    expect(await cli.run(['init', 'tool', 'all'])).toBe(1);
    expect(logger.fatal).toHaveBeenCalledWith('EROFS');
    expect(mocks.initializeTools).toHaveBeenCalledTimes(2);
  });

  test('skips the restore for a dry run', async () => {
    const cli = new Cli({ binaryName: 'cli' });
    registerCommands(cli, null);

    expect(await cli.run(['init', 'tool', 'all', '--dry-run'])).toBe(0);
    expect(mocks.restoreInstallDir).not.toHaveBeenCalled();
  });
});
