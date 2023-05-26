#!/usr/bin/env node

import { Builtins, Cli } from 'clipanion';
import process from 'node:process';
import { prepareCommands } from './command';
import { cliMode, validateSystem } from './utils';

const [node, app, ...args] = process.argv;

declare module globalThis {
  const CONTAINERBASE_VERSION: string | undefined;
}

async function main() {
  await validateSystem();

  const mode = cliMode();

  const cli = new Cli({
    binaryLabel: `containerbase-cli`,
    binaryName: mode ? mode : `${node} ${app}`,
    binaryVersion: globalThis.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER',
  });

  cli.register(Builtins.HelpCommand);

  cli.runExit(prepareCommands(cli, mode, args));
}

(async () => await main())();
