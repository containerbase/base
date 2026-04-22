import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  main: vi.fn(),
  isSea: vi.fn(),
}));

vi.mock('node:sea', () => mocks);
vi.mock('./main.ts', () => mocks);

describe('cli/index', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('works', async () => {
    await import('./index.ts');
    expect(mocks.main).toHaveBeenCalledTimes(1);
    expect(globalThis).not.toHaveProperty('__bundlerPathsOverrides');
  });

  test('uses sea', async () => {
    mocks.isSea.mockReturnValue(true);
    await import('./index.ts');
    expect(mocks.main).toHaveBeenCalledTimes(1);
    expect(globalThis).toHaveProperty('__bundlerPathsOverrides', {
      'pino-pretty': './pino-pretty.js',
      'pino-worker': './pino-worker.js',
      'pino/file': './pino-file.js',
      'thread-stream-worker': expect.stringMatching(
        /thread-stream-worker\.js$/,
      ),
    });
  });
});
