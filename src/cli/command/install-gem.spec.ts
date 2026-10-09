import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { partialVersionHelp } from '../install-tool/tool-version-resolver.ts';
import { MissingVersion } from '../utils/codes.ts';
import { registerCommands } from './index.ts';
import { InstallGemCommand, InstallGemShortCommand } from './install-gem.ts';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  resolveVersion: vi.fn((_, v) => v),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);
vi.mock('../prepare-tool/index.ts', () => mocks);

describe('cli/command/install-gem', () => {
  beforeEach(() => {
    vi.stubEnv('RAKE_VERSION', undefined);
  });

  test('describes partial versions', () => {
    expect(InstallGemCommand.usage?.details).toBe(partialVersionHelp);
    expect(InstallGemShortCommand.usage?.details).toBe(partialVersionHelp);
  });

  test('install-gem', async () => {
    const cli = new Cli({ binaryName: 'install-gem' });
    registerCommands(cli, 'install-gem');

    expect(await cli.run(['rake'])).toBe(MissingVersion);

    vi.stubEnv('RAKE_VERSION', '13.0.6');
    expect(await cli.run(['rake'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'rake',
      '13.0.6',
      false,
      'gem',
    );
    expect(await cli.run(['rake', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['rake'])).toBe(1);
  });

  test('containerbase-cli install gem', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);

    expect(await cli.run(['install', 'gem', 'rake'])).toBe(MissingVersion);

    vi.stubEnv('RAKE_VERSION', '13.0.6');
    expect(await cli.run(['install', 'gem', 'rake'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'rake',
      '13.0.6',
      false,
      'gem',
    );
    expect(await cli.run(['install', 'gem', 'rake', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['install', 'gem', 'rake'])).toBe(1);
  });
});
