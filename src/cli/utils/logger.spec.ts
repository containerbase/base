import { env } from 'node:process';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// TODO: can't do full coverage because of some vitest mock issues.

describe('cli/utils/logger', async () => {
  const { levels } = await vi.importActual<typeof import('pino')>('pino');

  beforeEach(() => {
    vi.resetModules();
    delete env.CONTAINERBASE_LOG_LEVEL;
    delete env.CONTAINERBASE_LOG_FORMAT;
    delete env.LOG_LEVEL;
    delete env.LOG_FORMAT;
    delete env.CONTAINERBASE_LOG_FILE;
    delete env.CONTAINERBASE_LOG_FILE_LEVEL;
    delete env.CONTAINERBASE_DEBUG;

    vi.doMock('pino', () => ({
      default: vi.fn(() => ({})),
      transport: vi.fn((v) => v),
      levels,
    }));
  });

  test('works', async () => {
    env.CONTAINERBASE_DEBUG = 'true';
    env.CONTAINERBASE_LOG_FILE = 'test.ndjson';
    const { default: pino } = await import('pino');
    const mod = await import('./logger');
    expect(mod.logger).toBeDefined();
    expect(pino).toHaveBeenCalledWith(
      { level: 'debug' },
      {
        targets: [
          { target: 'pino-pretty', level: 'debug', options: {} },
          {
            target: 'pino/file',
            level: 'debug',
            options: { destination: 'test.ndjson' },
          },
        ],
      },
    );
  });

  test('works - stdout with json', async () => {
    env.CONTAINERBASE_LOG_FORMAT = 'json';
    const { default: pino } = await import('pino');
    const mod = await import('./logger');
    expect(mod.logger).toBeDefined();
    expect(pino).toHaveBeenCalledWith(
      { level: 'info' },
      {
        targets: [{ target: 'pino/file', level: 'info', options: {} }],
      },
    );
  });

  test('works - debug stdout with json with file', async () => {
    env.LOG_FORMAT = 'json';
    env.CONTAINERBASE_LOG_LEVEL = 'warn';
    env.CONTAINERBASE_LOG_FILE = 'test.ndjson';
    const { default: pino } = await import('pino');
    const mod = await import('./logger');
    expect(mod.logger).toBeDefined();
    expect(pino).toHaveBeenCalledWith(
      { level: 'debug' },
      {
        targets: [
          { target: 'pino/file', level: 'warn', options: {} },
          {
            target: 'pino/file',
            level: 'debug',
            options: { destination: 'test.ndjson' },
          },
        ],
      },
    );
  });
});
