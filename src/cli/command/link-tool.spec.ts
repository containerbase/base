import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';

const mocks = vi.hoisted(() => ({
  linkTool: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);

describe('cli/command/link-tool', () => {
  const cli = new Cli({ binaryName: 'containerbase-cli' });
  registerCommands(cli, 'containerbase-cli');

  beforeEach(() => {
    vi.stubEnv('TOOL_NAME', undefined);
    vi.stubEnv('TOOL_VERSION', undefined);
  });

  test('missing TOOL_NAME', async () => {
    expect(await cli.run(['lt', 'node', 'bin'])).toBe(1);
    expect(mocks.linkTool).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      `Missing 'TOOL_NAME' environment variable`,
    );
  });
  test('missing TOOL_VERSION', async () => {
    vi.stubEnv('TOOL_NAME', 'node');
    expect(await cli.run(['lt', 'node', 'bin'])).toBe(1);
    expect(mocks.linkTool).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      `Missing 'TOOL_VERSION' environment variable`,
    );
  });

  test('works', async () => {
    vi.stubEnv('TOOL_NAME', 'node');
    vi.stubEnv('TOOL_VERSION', '1.2.3');

    expect(await cli.run(['lt', 'node', 'bin'])).toBe(0);
    expect(mocks.linkTool).toHaveBeenCalledExactlyOnceWith('node', {
      name: 'node',
      srcDir: 'bin',
    });
  });

  test('fails', async () => {
    vi.stubEnv('TOOL_NAME', 'node');
    vi.stubEnv('TOOL_VERSION', '1.2.3');
    mocks.linkTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['lt', 'node', 'bin'])).toBe(1);

    // a rejection which is not an `Error` has no message to report
    mocks.linkTool.mockRejectedValueOnce('boom');
    expect(await cli.run(['lt', 'node', 'bin'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.fatal).not.toHaveBeenCalledWith('boom');
  });
});
