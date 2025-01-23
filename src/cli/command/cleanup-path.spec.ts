import { Cli } from 'clipanion';
import { describe, expect, test, vi } from 'vitest';
import { prepareCommands } from '.';

const mocks = vi.hoisted(() => ({
  deleteAsync: vi.fn(),
}));

vi.mock('del', () => mocks);

describe('cli/command/cleanup-path', () => {
  test('download-file', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    prepareCommands(cli, null);

    expect(
      await cli.run(['cleanup', 'path', '/tmp/**:/var/tmp', '/some/path/**']),
    ).toBe(0);

    expect(mocks.deleteAsync).toHaveBeenCalledOnce();
    expect(mocks.deleteAsync).toHaveBeenCalledWith('/tmp/**', '/var/tmp', '/some/path/**', { dot: true });
  });
});
