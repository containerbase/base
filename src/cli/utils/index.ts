import { argv0 } from 'node:process';
import { type Options, type Result, type ResultPromise, execa } from 'execa';
import { type CliMode, cliModes } from './types.ts';

export * from './types.ts';
export * from './versions.ts';
export * from './logger.ts';
export * from './common.ts';
export * from './tags.ts';
export type {
  Options as SpawnOptions,
  Result as SpawnResult,
  ResultPromise as SpawnResultPromise,
};

/**
 * The cli mode from the name the binary was called as, eg. `install-tool`.
 * Running through node is the `containerbase-cli` mode.
 */
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

/**
 * Runs a command, forwarding stdin and stdout and sending stderr to stdout.
 * Binaries are never taken from local `node_modules`.
 */
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
