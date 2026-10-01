import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);
vi.mock('../prepare-tool/index.ts', () => mocks);

describe('cli/command/prepare-tool', () => {
  test('prepare-tool', async () => {
    const cli = new Cli({ binaryName: 'prepare-tool' });
    registerCommands(cli, 'prepare-tool');

    expect(await cli.run(['node'])).toBe(0);
    expect(mocks.prepareTools).toHaveBeenCalledExactlyOnceWith(['node'], false);

    mocks.prepareTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['node'])).toBe(1);

    // a rejection which is not an `Error` has no message to report
    mocks.prepareTools.mockRejectedValueOnce('boom');
    expect(await cli.run(['node'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.fatal).not.toHaveBeenCalledWith('boom');
  });

  test('containerbase-cli prepare tool', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, 'containerbase-cli');

    expect(await cli.run(['prepare', 'tool', 'node'])).toBe(0);
    expect(mocks.prepareTools).toHaveBeenCalledExactlyOnceWith(['node'], false);

    mocks.prepareTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['prepare', 'tool', 'node'])).toBe(1);
  });
});
