import 'reflect-metadata';
import { afterAll, beforeAll, vi } from 'vitest';

vi.mock('pino');

beforeAll(async () => {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  globalThis.cacheDir = await fs.mkdtemp('/tmp/containerbase-test-');
  globalThis.rootDir = await fs.mkdtemp('/tmp/containerbase-root-');

  const { env } = await import('node:process');

  env.CONTAINERBASE_CACHE_DIR = globalThis.cacheDir;
  env.CONTAINERBASE_ROOT_DIR = globalThis.rootDir;
});

afterAll(async () => {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  await fs.rm(globalThis.cacheDir, { recursive: true });
  await fs.rm(globalThis.rootDir, { recursive: true });
});
