import { env } from 'node:process';
import { Cli } from 'clipanion';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { prepareCommands } from '.';
import { scope } from '~test/http-mock';
import { cachePath } from '~test/path';

const mocks = vi.hoisted(() => ({
  installTool: vi.fn(),
  prepareTools: vi.fn(),
}));

vi.mock('../install-tool', () => mocks);
vi.mock('../prepare-tool', () => mocks);

describe('index', () => {
  beforeEach(() => {
    for (const key of Object.keys(env)) {
      if (key.startsWith('URL_REPLACE_')) {
        delete env[key];
      }
    }
  });

  test('download-file', async () => {
    const cli = new Cli({ binaryName: 'containerbase-cli' });
    prepareCommands(cli, null);

    const baseUrl = 'https://example.com';
    scope(baseUrl)
      .get('/file.txt')
      .reply(200, 'ok')
      .get('/fail.txt')
      .reply(404);

    env.URL_REPLACE_0_FROM = 'https://example.test';
    env.URL_REPLACE_0_TO = baseUrl;

    expect(
      await cli.run([
        'download',
        'file',
        'https://example.test/file.txt',
        cachePath('file.txt'),
      ]),
    ).toBe(0);

    expect(
      await cli.run([
        'download',
        'file',
        'https://example.test/fail.txt',
        cachePath('file.txt'),
      ]),
    ).toBe(1);
  });
});
