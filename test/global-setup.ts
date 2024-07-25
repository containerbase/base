import 'reflect-metadata';
import { afterAll, beforeAll, vi } from 'vitest';

vi.mock('pino');

let rootDir!: string;
let cacheDir!: string;

beforeAll(async () => {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  const os = await vi.importActual<typeof import('node:os')>('node:os');
  const path = await vi.importActual<typeof import('node:path')>('node:path');
  cacheDir = globalThis.cacheDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'containerbase-cache-'),
  );
  rootDir = globalThis.rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'containerbase-root-'),
  );

  const { env } =
    await vi.importActual<typeof import('node:process')>('node:process');

  env.CONTAINERBASE_CACHE_DIR = globalThis.cacheDir;
});

afterAll(async () => {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  await fs.rm(cacheDir, { recursive: true });
  await fs.rm(rootDir, { recursive: true });
});
