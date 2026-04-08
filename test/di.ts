import { Cli } from 'clipanion';
import { Container } from 'inversify';
import { registerCommands } from '../src/cli/command/index.ts';
import {
  createContainer,
  rootContainerModule,
} from '../src/cli/services/index.ts';
import type { CliMode } from '../src/cli/utils';

export async function testContainer() {
  const parent = new Container();
  await parent.loadAsync(rootContainerModule);
  return createContainer(parent);
}

export function testCli(mode: CliMode | null): Cli {
  const cli = new Cli({ binaryName: mode ?? 'containerbase-cli' });
  registerCommands(cli, mode);
  return cli;
}
