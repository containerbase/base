import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { prepareCommands } from '.';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('index', () => {
  test('prepare-tool', async () => {
    const cli = new Cli({ binaryName: 'prepare-tool' });
    prepareCommands(cli, 'prepare-tool');

    expect(await cli.run(['node'])).toBe(0);
    expect(mocks.prepareTools).toHaveBeenCalledOnce();
    expect(mocks.prepareTools).toHaveBeenCalledWith(['node'], false);

    mocks.prepareTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['node'])).toBe(1);
  });
});
