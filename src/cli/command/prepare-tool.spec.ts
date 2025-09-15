import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { registerCommands } from '.';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('cli/command/prepare-tool', () => {
  test('prepare-tool', async () => {
    const cli = new Cli({ binaryName: 'prepare-tool' });
    registerCommands(cli, 'prepare-tool');

    expect(await cli.run(['node'])).toBe(0);
    expect(mocks.prepareTools).toHaveBeenCalledOnce();
    expect(mocks.prepareTools).toHaveBeenCalledWith(['node'], false);

    mocks.prepareTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['node'])).toBe(1);
  });

  test('containerbase-cli prepare tool', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, 'containerbase-cli');

    expect(await cli.run(['prepare', 'tool', 'node'])).toBe(0);
    expect(mocks.prepareTools).toHaveBeenCalledOnce();
    expect(mocks.prepareTools).toHaveBeenCalledWith(['node'], false);

    mocks.prepareTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['prepare', 'tool', 'node'])).toBe(1);
  });
});
