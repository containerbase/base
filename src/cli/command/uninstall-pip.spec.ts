import { describe, expect, test, vi } from 'vitest';
import { MissingVersion } from '../utils/codes.ts';
import { testCli } from '~test/di.ts';

const mocks = vi.hoisted(() => ({
  uninstallTool: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);

describe('cli/command/uninstall-pip', () => {
  test.each([
    {
      mode: 'uninstall-pip' as const,
      args: [],
    },
    {
      mode: 'containerbase-cli' as const,
      args: ['uninstall', 'pip'],
    },
  ])('$mode $args', async ({ mode, args }) => {
    const cli = testCli(mode);
    expect(await cli.run([...(args ?? []), 'poetry'])).toBe(MissingVersion);

    expect(await cli.run([...(args ?? []), 'poetry', '5.0.0'])).toBe(0);

    expect(mocks.uninstallTool).toHaveBeenCalledExactlyOnceWith({
      dryRun: false,
      recursive: false,
      tool: 'poetry',
      type: 'pip',
      version: '5.0.0',
    });
    expect(await cli.run([...(args ?? []), 'poetry', '-d', '5.0.0'])).toBe(0);

    mocks.uninstallTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run([...(args ?? []), 'poetry', '5.0.0'])).toBe(1);
  });
});
