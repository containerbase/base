import { sep } from 'node:path';

export function cachePath(path: string): string {
  return `${globalThis.cacheDir}/${path}`.replace(/\/+/g, sep);
}

export function rootPath(path?: string): string {
  if (!path) {
    return globalThis.rootDir.replace(/\/+/g, sep);
  }
  return `${globalThis.rootDir}/${path}`.replace(/\/+/g, sep);
}
