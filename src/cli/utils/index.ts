import { argv0 } from 'node:process';
import type { CliMode } from './types';

export type * from './types';
export * from './versions';
export * from './logger';
export * from './common';

export function cliMode(): CliMode | null {
  if (argv0.endsWith('/containerbase-cli') || argv0 === 'containerbase-cli') {
    return 'containerbase-cli';
  }
  if (argv0.endsWith('/install-npm') || argv0 === 'install-npm') {
    return 'install-npm';
  }
  if (argv0.endsWith('/install-tool') || argv0 === 'install-tool') {
    return 'install-tool';
  }
  if (argv0.endsWith('/prepare-tool') || argv0 === 'prepare-tool') {
    return 'prepare-tool';
  }

  return null;
}
