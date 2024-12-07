import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MissingVersion } from '../utils/codes';
import { prepareCommands } from '.';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  resolveVersion: vi.fn((_, v) => v),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('cli/command/install-tool', () => {
  beforeEach(() => {
    delete env.NODE_VERSION;
  });

  test('works', async () => {
    const cli = new Cli({ binaryName: 'install-tool' });
    prepareCommands(cli, 'install-tool');

    expect(await cli.run(['node'])).toBe(MissingVersion);
    env.NODE_VERSION = '16.13.0';
    expect(await cli.run(['node'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'node',
      '16.13.0',
      false,
      undefined,
    );
    expect(await cli.run(['node', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['node'])).toBe(1);
  });
});
