import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prepareCommands } from '.';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('index', () => {
  beforeEach(() => {
    delete env.NODE_VERSION;
  });

  test('install-tool', async () => {
    const cli = new Cli({ binaryName: 'install-tool' });
    prepareCommands(cli, 'install-tool');

    expect(await cli.run(['node'])).toBe(1);
    env.NODE_VERSION = '16.13.0';
    expect(await cli.run(['node'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledOnce();
    expect(mocks.installTool).toHaveBeenCalledWith('node', '16.13.0', false);
    expect(await cli.run(['node', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['node'])).toBe(1);
  });
});
