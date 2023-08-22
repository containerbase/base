import { argv, argv0 } from 'node:process';
import { Builtins, Cli } from 'clipanion';
import { prepareCommands } from './command';
import { bootstrap } from './proxy';
import { cliMode, logger, parseBinaryName, validateSystem } from './utils';

declare global {
  // needs to be this to make eslint happy
  // eslint-disable-next-line no-var
  var CONTAINERBASE_VERSION: string | undefined;
}

export async function main(): Promise<void> {
  logger.trace({ argv0, argv }, 'main');
  bootstrap();
  await validateSystem();

  const mode = cliMode();
  const [node, app, ...args] = argv;

  const cli = new Cli({
    binaryLabel: `containerbase-cli`,
    binaryName: parseBinaryName(mode, node!, app!)!,
    binaryVersion: globalThis.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER',
  });

  cli.register(Builtins.DefinitionsCommand);
  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);

  prepareCommands(cli, mode);

  await cli.runExit(args);
}
