import process from 'node:process';
import type { CliMode } from './types';

export type * from './types';
export * from './versions';
export * from './logger';
export * from './common';

export function cliMode(): CliMode | null {
  if (
    process.argv0.endsWith('/install-tool') ||
    process.argv0 == 'install-tool'
  ) {
    return 'install-tool';
  }
  if (
    process.argv0.endsWith('/install-tool') ||
    process.argv0 == 'install-tool'
  ) {
    return 'containerbase-cli';
  }

  return null;
}
