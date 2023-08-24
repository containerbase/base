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
    delete env.RAKE_VERSION;
  });

  test('install-gem', async () => {
    const cli = new Cli({ binaryName: 'install-gem' });
    prepareCommands(cli, 'install-gem');

    expect(await cli.run(['rake'])).toBe(1);

    env.RAKE_VERSION = '13.0.6';
    expect(await cli.run(['rake'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledOnce();
    expect(mocks.installTool).toHaveBeenCalledWith(
      'rake',
      '13.0.6',
      false,
      'gem',
    );
    expect(await cli.run(['rake', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['rake'])).toBe(1);
  });
});
