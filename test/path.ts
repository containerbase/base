import { sep } from 'node:path';

export function cacheFile(path: string): string {
  return `${globalThis.cacheDir}/${path}`.replace(/\/+/g, sep);
}

export function rootFile(path?: string): string {
  if (!path) {
    return globalThis.rootDir.replace(/\/+/g, sep);
  }
  return `${globalThis.rootDir}/${path}`.replace(/\/+/g, sep);
}
