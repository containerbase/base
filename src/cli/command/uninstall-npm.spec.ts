import { describe, expect, test, vi } from 'vitest';
import { testCli } from '../../../test/di';
import { MissingVersion } from '../utils/codes';

const mocks = vi.hoisted(() => ({
  uninstallTool: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);

describe('cli/command/uninstall-npm', () => {
  test.each([
    {
      mode: 'uninstall-npm' as const,
      args: [],
    },
    {
      mode: 'containerbase-cli' as const,
      args: ['uninstall', 'npm'],
    },
  ])('$mode $args', async ({ mode, args }) => {
    const cli = testCli(mode);
    expect(await cli.run([...(args ?? []), 'del-cli'])).toBe(MissingVersion);

    expect(await cli.run([...(args ?? []), 'del-cli', '5.0.0'])).toBe(0);

    expect(mocks.uninstallTool).toHaveBeenCalledExactlyOnceWith(
      'del-cli',
      '5.0.0',
      false,
      'npm',
    );
    expect(await cli.run([...(args ?? []), 'del-cli', '-d', '5.0.0'])).toBe(0);

    mocks.uninstallTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run([...(args ?? []), 'del-cli', '5.0.0'])).toBe(1);
  });
});
