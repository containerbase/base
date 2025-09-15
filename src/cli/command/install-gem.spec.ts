import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MissingVersion } from '../utils/codes';
import { registerCommands } from '.';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  resolveVersion: vi.fn((_, v) => v),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('cli/command/install-gem', () => {
  beforeEach(() => {
    delete env.RAKE_VERSION;
  });

  test('install-gem', async () => {
    const cli = new Cli({ binaryName: 'install-gem' });
    registerCommands(cli, 'install-gem');

    expect(await cli.run(['rake'])).toBe(MissingVersion);

    env.RAKE_VERSION = '13.0.6';
    expect(await cli.run(['rake'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
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

  test('containerbase-cli install gem', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);

    expect(await cli.run(['install', 'gem', 'rake'])).toBe(MissingVersion);

    env.RAKE_VERSION = '13.0.6';
    expect(await cli.run(['install', 'gem', 'rake'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'rake',
      '13.0.6',
      false,
      'gem',
    );
    expect(await cli.run(['install', 'gem', 'rake', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['install', 'gem', 'rake'])).toBe(1);
  });
});
