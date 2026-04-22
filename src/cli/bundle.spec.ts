import { describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  main: vi.fn(),
  createRequire: vi.fn(),
}));

vi.mock('node:module', () => mocks);
vi.mock('./main.ts', () => mocks);

describe('cli/bundle', () => {
  test('works', async () => {
    const resolve = vi.fn((v) => v);
    mocks.createRequire.mockReturnValue({ resolve });
    await import('./bundle.ts');
    expect(mocks.main).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledExactlyOnceWith(
      './thread-stream-worker.js',
    );
    expect(globalThis.__bundlerPathsOverrides).toEqual({
      'pino-pretty': './pino-pretty.js',
      'pino-worker': './pino-worker.js',
      'pino/file': './pino-file.js',
      'thread-stream-worker': './thread-stream-worker.js',
    });
  });
});
