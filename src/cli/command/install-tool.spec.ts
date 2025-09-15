import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils';
import { MissingVersion } from '../utils/codes';
import { registerCommands } from '.';

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
    env.IGNORED_TOOLS = 'pnpm,php';
  });

  test('install-tool', async () => {
    const cli = new Cli({ binaryName: 'install-tool' });
    registerCommands(cli, 'install-tool');

    expect(await cli.run(['bower'])).toBe(MissingVersion);
    expect(logger.warn).toHaveBeenCalledWith(
      `The 'install-tool bower' command is deprecated. Please use the 'install-npm bower'.`,
    );
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

    expect(await cli.run(['php'])).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ tool: 'php' }, 'tool ignored');
  });

  test('containerbase-cli install tool', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);

    expect(await cli.run(['install', 'tool', 'bower'])).toBe(MissingVersion);
    expect(logger.warn).toHaveBeenCalledWith(
      `The 'install-tool bower' command is deprecated. Please use the 'install-npm bower'.`,
    );
    expect(await cli.run(['install', 'tool', 'node', 'v16.13.0'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'node',
      '16.13.0',
      false,
      undefined,
    );
    env.NODE_VERSION = '16.13.0';
    expect(await cli.run(['install', 'tool', 'node', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['install', 'tool', 'node'])).toBe(1);

    expect(await cli.run(['install', 'tool', 'php'])).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ tool: 'php' }, 'tool ignored');
  });
});
