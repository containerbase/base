#!/usr/bin/env node

import process from 'node:process';
import { Builtins, Cli } from 'clipanion';
import { parseBinaryName, prepareCommands } from './command';
import { cliMode, logger, validateSystem } from './utils';

declare global {
  // needs to be this to make eslint happy
  // eslint-disable-next-line no-var
  var CONTAINERBASE_VERSION: string | undefined;
}

async function main(): Promise<void> {
  logger.trace({ argv0: process.argv0, argv: process.argv }, 'main');
  await validateSystem();

  const mode = cliMode();
  const [node, app, ...args] = process.argv;

  const cli = new Cli({
    binaryLabel: `containerbase-cli`,
    binaryName: parseBinaryName(mode, node, app),
    binaryVersion: globalThis.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER',
  });

  cli.register(Builtins.HelpCommand);

  await cli.runExit(prepareCommands(cli, mode, args));
}

void (async () => await main())();
