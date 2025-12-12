import { argv0 } from 'node:process';
import nanoSpawn, { type Options, type Subprocess } from 'nano-spawn';
import { type CliMode, cliModes } from './types';

export type * from './types';
export * from './versions';
export * from './logger';
export * from './common';
export type { Options as SpawnOptions, Subprocess as SpawnResult };

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

export async function spawn(
  cmd: string,
  args: string[],
  options?: Options,
): Promise<Subprocess> {
  return await nanoSpawn(cmd, args, {
    stdio: ['inherit', 'inherit', 1],
    ...options,
  });
}
