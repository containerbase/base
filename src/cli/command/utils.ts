import { env } from 'node:process';
import type { Cli, CommandClass } from 'clipanion';
import { EnvService, createContainer } from '../services/index.ts';
import { type CliMode, logger } from '../utils/index.ts';

/** Reads the tool version from the `<TOOL>_VERSION` environment variable. */
export function getVersion(tool: string): string | undefined {
  return env[tool.replace('-', '_').toUpperCase() + '_VERSION'];
}

/** Whether the tool is listed in the `IGNORED_TOOLS` environment variable. */
export async function isToolIgnored(tool: string): Promise<boolean> {
  const container = createContainer();
  return (await container.getAsync(EnvService)).isToolIgnored(tool);
}

const commands: Record<CliMode, CommandClass[]> = {} as never;

type CommandDecorator = <T extends CommandClass = CommandClass>(
  target: T,
) => T | void;

/** Class decorator which registers a command for the given cli mode. */
export function command(mode: CliMode): CommandDecorator {
  return <T extends CommandClass>(target: T): T | void => {
    commands[mode] ??= [];
    commands[mode].push(target);

    return target;
  };
}

/**
 * Registers the commands of the cli mode, falling back to the
 * `containerbase-cli` commands.
 */
export function registerCommands(cli: Cli, mode: CliMode | null): void {
  logger.debug('prepare commands');
  for (const command of commands[mode ?? 'containerbase-cli'] ?? []) {
    cli.register(command);
  }
}
