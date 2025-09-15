import { env } from 'node:process';
import type { CommandClass } from 'clipanion';
import { EnvService, createContainer } from '../services';
import type { CliMode } from '../utils';

export function getVersion(tool: string): string | undefined {
  return env[tool.replace('-', '_').toUpperCase() + '_VERSION'];
}

export async function isToolIgnored(tool: string): Promise<boolean> {
  const container = createContainer();
  return (await container.getAsync(EnvService)).isToolIgnored(tool);
}

const commands: Record<CliMode, CommandClass[]> = {} as never;

type CommandDecorator = <T extends CommandClass = CommandClass>(
  target: T,
) => T | void;

export function command(mode: CliMode): CommandDecorator {
  return <T extends CommandClass>(target: T): T | void => {
    commands[mode] ??= [];
    commands[mode].push(target);

    return target;
  };
}

export function getCommands(mode: CliMode): CommandClass[] {
  return commands[mode] ?? [];
}
