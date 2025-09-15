import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils';
import { registerCommands } from '.';

const mocks = vi.hoisted(() => ({
  linkTool: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);

describe('cli/command/link-tool', () => {
  const cli = new Cli({ binaryName: 'containerbase-cli' });
  registerCommands(cli, 'containerbase-cli');

  beforeEach(() => {
    delete env.TOOL_NAME;
    delete env.TOOL_VERSION;
  });

  test('missing TOOL_NAME', async () => {
    expect(await cli.run(['lt', 'node', 'bin'])).toBe(1);
    expect(mocks.linkTool).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      `Missing 'TOOL_NAME' environment variable`,
    );
  });
  test('missing TOOL_VERSION', async () => {
    env.TOOL_NAME = 'node';
    expect(await cli.run(['lt', 'node', 'bin'])).toBe(1);
    expect(mocks.linkTool).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      `Missing 'TOOL_VERSION' environment variable`,
    );
  });

  test('works', async () => {
    env.TOOL_NAME = 'node';
    env.TOOL_VERSION = '1.2.3';

    expect(await cli.run(['lt', 'node', 'bin'])).toBe(0);
    expect(mocks.linkTool).toHaveBeenCalledOnce();
    expect(mocks.linkTool).toHaveBeenCalledWith('node', {
      name: 'node',
      srcDir: 'bin',
    });
  });

  test('fails', async () => {
    env.TOOL_NAME = 'node';
    env.TOOL_VERSION = '1.2.3';
    mocks.linkTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['lt', 'node', 'bin'])).toBe(1);
  });
});
