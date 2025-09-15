import { argv, argv0, version } from 'node:process';
import { Builtins, Cli } from 'clipanion';
import { registerCommands } from './command';
import { bootstrap } from './proxy';
import { cliMode, logger, parseBinaryName, validateSystem } from './utils';

declare global {
  // needs to be this to make eslint happy
  var CONTAINERBASE_VERSION: string | undefined;
}

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

  registerCommands(mode, cli);

  await cli.runExit(args);
}
