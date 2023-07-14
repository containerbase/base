import { sep } from 'node:path';

export function cacheFile(path: string): string {
  return `${globalThis.cacheDir}/${path}`.replace(/\/+/g, sep);
}
