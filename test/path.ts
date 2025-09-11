import { join, sep } from 'node:path';
import { vi } from 'vitest';

export function cachePath(path: string): string {
  return `${globalThis.cacheDir}/${path}`.replace(/\/+/g, sep);
}

export function rootPath(path?: string): string {
  if (!path) {
    return globalThis.rootDir!.replace(/\/+/g, sep);
  }
  return join(globalThis.rootDir!, path).replace(/\/+/g, sep);
}

export async function ensurePaths(paths: string | string[]): Promise<void> {
  const fs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  for (const p of Array.isArray(paths) ? paths : [paths]) {
    const prepDir = rootPath(p);
    await fs.mkdir(prepDir, {
      recursive: true,
    });
  }
}
