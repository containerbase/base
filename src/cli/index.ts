import { Builtins, Cli } from 'clipanion';
import process from 'node:process';
import { InstallToolCommand } from './command/install-tool';

const [node, app, ...args] = process.argv;

/*
 * Workaround for linking the cli tool as different executables.
 * So it can be called as `install-tool node 1.2.3`.
 */
if (
  process.argv0.endsWith('/install-tool') ||
  process.argv0 == 'install-tool'
) {
  args.unshift('install', 'tool');
}

declare module globalThis {
  const CONTAINERBASE_VERSION: string | undefined;
}

const cli = new Cli({
  binaryLabel: `containerbase-cli`,
  binaryName: `${node} ${app}`,
  binaryVersion: globalThis.CONTAINERBASE_VERSION ?? '0.0.0-PLACEHOLDER',
});

cli.register(Builtins.HelpCommand);
cli.register(InstallToolCommand);
cli.runExit(args);
