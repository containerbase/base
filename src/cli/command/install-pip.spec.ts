import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MissingVersion } from '../utils/codes';
import { prepareCommands } from '.';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  resolveVersion: vi.fn((_, v) => v),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('install-pip', () => {
  beforeEach(() => {
    delete env.POETRY_VERSION;
  });

  test('works', async () => {
    const cli = new Cli({ binaryName: 'install-pip' });
    prepareCommands(cli, 'install-pip');

    expect(await cli.run(['poetry'])).toBe(MissingVersion);

    mocks.resolveVersion.mockResolvedValueOnce('4.0.0');
    expect(await cli.run(['poetry'])).toBe(0);

    env.POETRY_VERSION = '5.0.0';
    expect(await cli.run(['poetry'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(2);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'poetry',
      '4.0.0',
      false,
      'pip',
    );
    expect(mocks.installTool).toHaveBeenCalledWith(
      'poetry',
      '5.0.0',
      false,
      'pip',
    );
    expect(await cli.run(['poetry', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['poetry'])).toBe(1);
  });
});
