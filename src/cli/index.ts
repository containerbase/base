import { Cli } from 'clipanion';
//import process from 'node:process';
import { InstallToolCommand } from './command/install-tool';

const [node, app, ...args] = process.argv;

if (
  process.argv0.endsWith('/install-tool') ||
  process.argv0 == 'install-tool'
) {
  args.unshift('install', 'tool');
}

// console.log(args);

const cli = new Cli({
  binaryLabel: `containerbase-cli`,
  binaryName: `${node} ${app}`,
  binaryVersion: process.env.CONTAINERBASE_VERSION,
});

cli.register(InstallToolCommand);
cli.runExit(args);
