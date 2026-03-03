import { argv0 } from 'node:process';
import { type Options, type Result, type ResultPromise, execa } from 'execa';
import { type CliMode, cliModes } from './types';

export type * from './types';
export * from './versions';
export * from './logger';
export * from './common';
export type {
  Options as SpawnOptions,
  Result as SpawnResult,
  ResultPromise as SpawnResultPromise,
};

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

export function spawn(
  cmd: string,
  args: string[],
  options?: Options,
): ResultPromise<Options> {
  return execa<Options>(cmd, args, {
    stdio: ['inherit', 'inherit', 1],
    ...options,
    preferLocal: false,
    node: false,
  });
}
