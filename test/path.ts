import { sep } from 'node:path';
import { env } from 'node:process';

export function cacheFile(path: string): string {
  return `${env.CONTAINERBASE_CACHE_DIR}/${path}`.replace(/\/+/g, sep);
}
