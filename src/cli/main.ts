import { argv, argv0, exit, version } from 'node:process';
import { Builtins, Cli } from 'clipanion';
import { registerCommands } from './command/index.ts';
import { bootstrap } from './proxy.ts';
import {
  cliMode,
  logger,
  parseBinaryName,
  validateSystem,
} from './utils/index.ts';

declare global {
  // needs to be this to make eslint happy
  var CONTAINERBASE_VERSION: string | undefined;
}

/**
 * The cli entry point: sets up the proxy, validates the system, and runs the
 * commands of the mode the binary was called as.
 */
export async function main(): Promise<void> {
  logger.trace({ argv0, argv, version }, 'main');
  bootstrap();
  await validateSystem();

  const mode = cliMode();
  const [node, app, ...args] = argv;

  const cli = new Cli({
    binaryLabel: `containerbase-cli`,
    binaryName: parseBinaryName(mode, node!, app!)!,
    binaryVersion: `${
      globalThis.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER'
    } (Node ${version})`,
  });

  cli.register(Builtins.DefinitionsCommand);
  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);

  registerCommands(cli, mode);

  // Explicitly call exit to force pino shutdown
  exit(await cli.run(args));
}
