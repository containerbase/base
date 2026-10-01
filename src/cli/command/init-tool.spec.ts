import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
  initializeTools: vi.fn(),
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
});
