import { Cli } from 'clipanion';
import { Container } from 'inversify';
import { registerCommands } from '../src/cli/command';
import { createContainer, rootContainerModule } from '../src/cli/services';
import type { CliMode } from '../src/cli/utils';

export async function testContainer() {
  const parent = new Container();
  await parent.load(rootContainerModule);
  return createContainer(parent);
}

export function testCli(mode: CliMode | null): Cli {
  const cli = new Cli({ binaryName: mode ?? 'containerbase-cli' });
  registerCommands(cli, mode);
  return cli;
}
