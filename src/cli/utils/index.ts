import { argv0 } from 'node:process';
import { type CliMode, cliModes } from './types';

export type * from './types';
export * from './versions';
export * from './logger';
export * from './common';

export function cliMode(): CliMode | null {
  for (const mode of cliModes) {
    if (argv0.endsWith(`/${mode}`) || argv0 === mode) {
      return mode;
    }
  }

  // Test mode
  if (argv0.endsWith(`/node`) || argv0 === 'node') {
    return 'containerbase-cli';
  }

  return null;
}
