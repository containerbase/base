import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MissingVersion } from '../utils/codes.ts';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  resolveVersion: vi.fn((_, v) => v),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);
vi.mock('../prepare-tool/index.ts', () => mocks);

describe('cli/command/install-tool', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_VERSION', undefined);
    vi.stubEnv('IGNORED_TOOLS', 'pnpm,php');
  });

  test('install-tool', async () => {
    const cli = new Cli({ binaryName: 'install-tool' });
    registerCommands(cli, 'install-tool');

    expect(await cli.run(['bower'])).toBe(MissingVersion);
    expect(logger.warn).toHaveBeenCalledWith(
      `The 'install-tool bower' command is deprecated. Please use the 'install-npm bower'.`,
    );
    vi.stubEnv('NODE_VERSION', '16.13.0');
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

    // a non-zero exit code from the install is reported as a failure too
    mocks.installTool.mockResolvedValueOnce(2);
    expect(await cli.run(['node'])).toBe(2);
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Install tool node failed'),
    );

    // a rejection which is not an `Error` has no message to report
    mocks.installTool.mockRejectedValueOnce('boom');
    expect(await cli.run(['node'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');

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
    vi.stubEnv('NODE_VERSION', '16.13.0');
    expect(await cli.run(['install', 'tool', 'node', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['install', 'tool', 'node'])).toBe(1);

    expect(await cli.run(['install', 'tool', 'php'])).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ tool: 'php' }, 'tool ignored');
  });
});
