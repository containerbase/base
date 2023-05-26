#!/usr/bin/env node

import { Builtins, Cli } from 'clipanion';
import process from 'node:process';
import { parseBinaryName, prepareCommands } from './command';
import { cliMode, logger, validateSystem } from './utils';

declare module globalThis {
  const CONTAINERBASE_VERSION: string | undefined;
}

async function main() {
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

  cli.runExit(prepareCommands(cli, mode, args));
}

(async () => await main())();
