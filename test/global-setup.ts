import { afterAll, beforeAll, vi } from 'vitest';

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  })),
  transport: vi.fn(),
  levels: { values: {} },
}));

// the waits between the attempts of a request, see `HttpService`
vi.mock('node:timers/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:timers/promises')>()),
  // resolves at once with the value, like the real one after the delay
  setTimeout: vi.fn((_ms?: number, value?: unknown) => Promise.resolve(value)),
}));

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
  await fs.rm(cacheDir, { recursive: true, force: true });
  await fs.rm(rootDir, { recursive: true, force: true });
});
