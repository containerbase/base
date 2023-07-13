import 'reflect-metadata';
import fs from 'node:fs/promises';
import { env } from 'node:process';
import { afterAll, beforeAll, vi } from 'vitest';

vi.mock('../src/cli/utils/logger');

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ProcessEnv {
      CONTAINERBASE_CACHE_DIR: string;
    }
  }
}

let cacheDir: string;

beforeAll(async () => {
  cacheDir = await fs.mkdtemp('/tmp/containerbase-test-');
  env.CONTAINERBASE_CACHE_DIR = cacheDir;
});

afterAll(async () => {
  await fs.rm(cacheDir, { recursive: true });
});
