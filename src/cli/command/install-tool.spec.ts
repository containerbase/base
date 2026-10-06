import fs from 'node:fs/promises';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PathService, createContainer } from '../services/index.ts';
import { MissingVersion } from '../utils/codes.ts';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  resolveVersion: vi.fn((_, v) => v),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);
vi.mock('../prepare-tool/index.ts', () => mocks);

describe('cli/command/install-tool', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_VERSION', undefined);
    vi.stubEnv('IGNORED_TOOLS', 'pnpm,php');
  });

  test('install-tool', async () => {
    const cli = new Cli({ binaryName: 'install-tool' });
    registerCommands(cli, 'install-tool');

    expect(await cli.run(['bower'])).toBe(MissingVersion);
    expect(logger.warn).toHaveBeenCalledWith(
      `The 'install-tool bower' command is deprecated. Please use the 'install-npm bower'.`,
    );
    vi.stubEnv('NODE_VERSION', '16.13.0');
    expect(await cli.run(['node'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'node',
      '16.13.0',
      false,
      undefined,
    );
    expect(await cli.run(['node', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['node'])).toBe(1);

    // a non-zero exit code from the install is reported as a failure too
    mocks.installTool.mockResolvedValueOnce(2);
    expect(await cli.run(['node'])).toBe(2);
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Install tool node failed'),
    );

    // a rejection which is not an `Error` has no message to report
    mocks.installTool.mockRejectedValueOnce('boom');
    expect(await cli.run(['node'])).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');

    expect(await cli.run(['php'])).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ tool: 'php' }, 'tool ignored');
  });

  test('fails before resolving when the folders are not writable', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);
    const pathSvc = await createContainer().getAsync(PathService);
    vi.spyOn(fs, 'access').mockImplementation((path) =>
      path === pathSvc.toolsPath
        ? Promise.reject(Object.assign(new Error('EROFS'), { code: 'EROFS' }))
        : Promise.resolve(),
    );
    const message = `EROFS: can't write to ${pathSvc.toolsPath}, the file system is read-only. Install tools at image build time or mount the containerbase folders writable.`;

    expect(await cli.run(['install', 'tool', 'flux', '0.27.2'])).toBe(1);
    // the npm, pip and gem installers share the install command
    expect(await cli.run(['install', 'npm', 'del-cli', '5.0.0'])).toBe(1);

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(message);
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Install tool flux failed'),
    );
    expect(logger.fatal).toHaveBeenCalledWith(
      expect.stringContaining('Install npm del-cli failed'),
    );
    expect(mocks.resolveVersion).not.toHaveBeenCalled();
    expect(mocks.installTool).not.toHaveBeenCalled();
  });

  test('skips the writable check for a dry run', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);
    const access = vi
      .spyOn(fs, 'access')
      .mockRejectedValue(Object.assign(new Error('EROFS'), { code: 'EROFS' }));

    expect(await cli.run(['install', 'tool', 'flux', '0.27.2', '-d'])).toBe(0);

    expect(access).not.toHaveBeenCalled();
    expect(mocks.installTool).toHaveBeenCalledExactlyOnceWith(
      'flux',
      '0.27.2',
      true,
      undefined,
    );
  });

  test('containerbase-cli install tool', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);

    expect(await cli.run(['install', 'tool', 'bower'])).toBe(MissingVersion);
    expect(logger.warn).toHaveBeenCalledWith(
      `The 'install-tool bower' command is deprecated. Please use the 'install-npm bower'.`,
    );
    expect(await cli.run(['install', 'tool', 'node', 'v16.13.0'])).toBe(0);
    expect(mocks.installTool).toHaveBeenCalledTimes(1);
    expect(mocks.installTool).toHaveBeenCalledWith(
      'node',
      '16.13.0',
      false,
      undefined,
    );
    vi.stubEnv('NODE_VERSION', '16.13.0');
    expect(await cli.run(['install', 'tool', 'node', '-d'])).toBe(0);

    mocks.installTool.mockRejectedValueOnce(new Error('test'));
    expect(await cli.run(['install', 'tool', 'node'])).toBe(1);

    expect(await cli.run(['install', 'tool', 'php'])).toBe(0);
    expect(logger.info).toHaveBeenCalledWith({ tool: 'php' }, 'tool ignored');
  });
});
