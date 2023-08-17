import 'reflect-metadata';
import fs from 'node:fs/promises';
import { env } from 'node:process';
import { afterAll, beforeAll, vi } from 'vitest';

vi.mock('pino');

beforeAll(async () => {
  globalThis.cacheDir = await fs.mkdtemp('/tmp/containerbase-test-');

  env.CONTAINERBASE_CACHE_DIR = globalThis.cacheDir;
});

afterAll(async () => {
  await fs.rm(globalThis.cacheDir, { recursive: true });
});
