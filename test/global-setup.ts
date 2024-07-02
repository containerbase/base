import 'reflect-metadata';
import { afterAll, beforeAll, vi } from 'vitest';

vi.mock('pino');

beforeAll(async () => {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  const os = await vi.importActual<typeof import('node:os')>('node:os');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  globalThis.cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'containerbase-cache-'),
  );
  globalThis.rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'containerbase-root-'),
  );

  const { env } =
    await vi.importActual<typeof import('node:process')>('node:process');

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
