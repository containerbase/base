import { beforeEach, describe, expect, test, vi } from 'vitest';

// TODO: can't do full coverage because of some vitest mock issues.

describe('cli/utils/logger', async () => {
  const { levels } = await vi.importActual<typeof import('pino')>('pino');

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('CONTAINERBASE_LOG_LEVEL', undefined);
    vi.stubEnv('CONTAINERBASE_LOG_FORMAT', undefined);
    vi.stubEnv('LOG_LEVEL', undefined);
    vi.stubEnv('LOG_FORMAT', undefined);
    vi.stubEnv('CONTAINERBASE_LOG_FILE', undefined);
    vi.stubEnv('CONTAINERBASE_LOG_FILE_LEVEL', undefined);
    vi.stubEnv('CONTAINERBASE_DEBUG', undefined);

    vi.doMock('pino', () => ({
      default: vi.fn(() => ({})),
      transport: vi.fn((v) => v),
      levels,
    }));
  });

  test('works', async () => {
    vi.stubEnv('CONTAINERBASE_DEBUG', 'true');
    vi.stubEnv('CONTAINERBASE_LOG_FILE', 'test.ndjson');
    const { default: pino } = await import('pino');
    const mod = await import('./logger.ts');
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
    vi.stubEnv('CONTAINERBASE_LOG_FORMAT', 'json');
    const { default: pino } = await import('pino');
    const mod = await import('./logger.ts');
    expect(mod.logger).toBeDefined();
    expect(pino).toHaveBeenCalledWith(
      { level: 'info' },
      {
        targets: [{ target: 'pino/file', level: 'info', options: {} }],
      },
    );
  });

  test('works - debug stdout with json with file', async () => {
    vi.stubEnv('LOG_FORMAT', 'json');
    vi.stubEnv('CONTAINERBASE_LOG_LEVEL', 'warn');
    vi.stubEnv('CONTAINERBASE_LOG_FILE', 'test.ndjson');
    const { default: pino } = await import('pino');
    const mod = await import('./logger.ts');
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
