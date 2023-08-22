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
    delete env.DEL_CLI_VERSION;
  });

  test('install-npm', async () => {
    const cli = new Cli({ binaryName: 'install-npm' });
    prepareCommands(cli, 'install-npm');

    expect(await cli.run(['del-cli'])).toBe(1);

    env.DEL_CLI_VERSION = '5.0.0';
    expect(await cli.run(['del-cli'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledOnce();
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
