import { describe, expect, test, vi } from 'vitest';
import { testCli } from '../../../test/di';
import { MissingVersion } from '../utils/codes';

const mocks = vi.hoisted(() => ({
  uninstallTool: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);

describe('cli/command/uninstall-gem', () => {
  test.each([
    {
      mode: 'uninstall-gem' as const,
      args: [],
    },
    {
      mode: 'containerbase-cli' as const,
      args: ['uninstall', 'gem'],
    },
  ])('$mode $args', async ({ mode, args }) => {
    const cli = testCli(mode);
    expect(await cli.run([...(args ?? []), 'rake'])).toBe(MissingVersion);

    expect(await cli.run([...(args ?? []), 'rake', '5.0.0'])).toBe(0);

    expect(mocks.uninstallTool).toHaveBeenCalledExactlyOnceWith({
      dryRun: false,
      recursive: false,
      tool: 'rake',
      type: 'gem',
      version: '5.0.0',
    });
    expect(await cli.run([...(args ?? []), 'rake', '-d', '5.0.0'])).toBe(0);

    mocks.uninstallTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run([...(args ?? []), 'rake', '5.0.0'])).toBe(1);
  });
});
