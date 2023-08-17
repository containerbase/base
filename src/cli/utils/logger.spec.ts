import { env } from 'node:process';
import { beforeEach } from 'node:test';
import { describe, expect, test, vi } from 'vitest';

// TODO: can't do full coverage because of some vitest mock issues.

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
    delete env.CONTAINERBASE_LOG_LEVEL;
    delete env.CONTAINERBASE_LOG_FILE;
    delete env.CONTAINERBASE_LOG_FILE_LEVEL;
    delete env.CONTAINERBASE_DEBUG;
  });

  test('works', async () => {
    env.CONTAINERBASE_DEBUG = 'true';
    env.CONTAINERBASE_LOG_FILE = 'test.ndjson';
    const { pino } = await import('pino');
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
});
