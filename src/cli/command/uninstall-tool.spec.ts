import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MissingVersion } from '../utils/codes.ts';
import { logger } from '../utils/index.ts';
import { testCli } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  uninstallTool: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);

describe('cli/command/uninstall-tool', () => {
  beforeEach(() => {
    vi.stubEnv('IGNORED_TOOLS', 'pnpm,php');
  });

  test.each([
    {
      mode: 'uninstall-tool' as const,
      args: [],
    },
    {
      mode: 'containerbase-cli' as const,
      args: ['uninstall', 'tool'],
    },
  ])('$mode $args', async ({ mode, args }) => {
    const cli = testCli(mode);
    expect(await cli.run([...(args ?? []), 'node'])).toBe(MissingVersion);

    expect(await cli.run([...(args ?? []), 'node', '16.13.0'])).toBe(0);
    expect(mocks.uninstallTool).toHaveBeenCalledTimes(1);
    expect(mocks.uninstallTool).toHaveBeenCalledWith({
      dryRun: false,
      recursive: false,
      tool: 'node',
      type: undefined,
      version: '16.13.0',
    });
    expect(await cli.run([...(args ?? []), 'node', '16.13.0', '-d'])).toBe(0);

    mocks.uninstallTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run([...(args ?? []), 'node', '16.13.0'])).toBe(1);

    // a non-zero exit code from the uninstall is reported as a failure too
    mocks.uninstallTool.mockResolvedValueOnce(2);
    expect(await cli.run([...(args ?? []), 'node', '16.13.0'])).toBe(2);
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Uninstall tool node failed'),
    );

    expect(await cli.run([...(args ?? []), 'php'])).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ tool: 'php' }, 'tool ignored');
  });
});
