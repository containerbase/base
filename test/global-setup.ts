import 'reflect-metadata';
import fs from 'node:fs/promises';
import { env } from 'node:process';
import { afterAll, beforeAll, vi } from 'vitest';

vi.mock('pino');

beforeAll(async () => {
  globalThis.cacheDir = await fs.mkdtemp('/tmp/containerbase-test-');
  globalThis.rootDir = await fs.mkdtemp('/tmp/containerbase-root-');

  env.CONTAINERBASE_CACHE_DIR = globalThis.cacheDir;
  env.CONTAINERBASE_ROOT_DIR = globalThis.rootDir;
});

afterAll(async () => {
  await fs.rm(globalThis.cacheDir, { recursive: true });
  await fs.rm(globalThis.rootDir, { recursive: true });
});
