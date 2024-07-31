import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { prepareCommands } from '.';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
  initializeTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('index', () => {
  test('init-tool', async () => {
    const cli = new Cli({ binaryName: 'cli' });
    prepareCommands(cli, null);

    expect(await cli.run(['init', 'tool', 'node'])).toBe(0);
    expect(mocks.initializeTools).toHaveBeenCalledOnce();
    expect(mocks.initializeTools).toHaveBeenCalledWith(['node'], false);

    mocks.initializeTools.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['init', 'tool', 'node'])).toBe(1);
  });
});
