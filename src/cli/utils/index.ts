import { argv0 } from 'node:process';
import type { CliMode } from './types';

export type * from './types';
export * from './versions';
export * from './logger';
export * from './common';

export function cliMode(): CliMode | null {
  if (argv0.endsWith('/install-tool') || argv0 === 'install-tool') {
    return 'install-tool';
  }
  if (argv0.endsWith('/install-tool') || argv0 === 'install-tool') {
    return 'containerbase-cli';
  }

  return null;
}
