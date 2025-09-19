import { env } from 'node:process';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { testCli } from '../../../test/di';
import { logger } from '../utils';
import { MissingVersion } from '../utils/codes';

const mocks = vi.hoisted(() => ({
  uninstallTool: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);

describe('cli/command/uninstall-tool', () => {
  beforeEach(() => {
    env.IGNORED_TOOLS = 'pnpm,php';
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
    expect(mocks.uninstallTool).toHaveBeenCalledWith(
      'node',
      '16.13.0',
      false,
      undefined,
    );
    expect(await cli.run([...(args ?? []), 'node', '16.13.0', '-d'])).toBe(0);

    mocks.uninstallTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run([...(args ?? []), 'node', '16.13.0'])).toBe(1);

    expect(await cli.run([...(args ?? []), 'php'])).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ tool: 'php' }, 'tool ignored');
  });
});
