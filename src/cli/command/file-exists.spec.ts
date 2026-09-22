import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EnvService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { registerCommands } from './index.ts';
import { scope } from '~test/http-mock.ts';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool/index.ts', () => mocks);
vi.mock('../prepare-tool/index.ts', () => mocks);

describe('cli/command/file-exists', () => {
  beforeEach(() => {
    for (const key of Object.keys(env)) {
      if (key.startsWith('URL_REPLACE_')) {
        delete env[key];
      }
    }
  });

  test('file-exists', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    registerCommands(cli, null);

    const baseUrl = 'https://example.com';
    scope(baseUrl)
      .head('/file.txt')
      .reply(200, 'ok')
      .head('/fail.txt')
      .reply(404);

    env.URL_REPLACE_0_FROM = 'https://example.test';
    env.URL_REPLACE_0_TO = baseUrl;

    expect(
      await cli.run(['file', 'exists', 'https://example.test/file.txt']),
    ).toBe(0);

    expect(
      await cli.run(['file', 'exists', 'https://example.test/fail.txt']),
    ).toBe(1);

    expect(await cli.run(['file', 'exists', ''])).toBe(-1);

    // a failure which is not an `Error` has no message to report
    const boom: unknown = 'boom';
    vi.spyOn(EnvService.prototype, 'replaceUrl').mockImplementationOnce(() => {
      throw boom;
    });
    expect(
      await cli.run(['file', 'exists', 'https://example.test/file.txt']),
    ).toBe(-1);
    expect(logger.debug).toHaveBeenCalledWith('boom');
    expect(logger.error).not.toHaveBeenCalledWith('boom');
  });
});
