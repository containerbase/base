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

describe('install-npm', () => {
  beforeEach(() => {
    delete env.DEL_CLI_VERSION;
  });

  test('works', async () => {
    const cli = new Cli({ binaryName: 'install-npm' });
    prepareCommands(cli, 'install-npm');

    expect(await cli.run(['del-cli'])).toBe(MissingVersion);

    mocks.resolveVersion.mockResolvedValueOnce('4.0.0');
    expect(await cli.run(['del-cli'])).toBe(0);

    env.DEL_CLI_VERSION = '5.0.0';
    expect(await cli.run(['del-cli'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(2);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'del-cli',
      '4.0.0',
      false,
      'npm',
    );
    expect(mocks.installTool).toHaveBeenCalledWith(
      'del-cli',
      '5.0.0',
      false,
      'npm',
    );
    expect(await cli.run(['del-cli', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['del-cli'])).toBe(1);
  });
});
