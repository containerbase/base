import type { Cli } from 'clipanion';
import {
  InstallToolLegacyCommand,
  InstallToolLegacyShortCommand,
} from './install-tools/legacy';
import {
  InstallToolNodeCommand,
  InstallToolNodeShortCommand,
} from './install-tools/node';
import type { CliMode } from '../utils';
import { prepareToolVersion } from './install-tools/utils';
import { logger } from '../utils/logger';

export function prepareCommands(
  cli: Cli,
  mode: CliMode,
  args: string[]
): string[] {
  logger.debug('prepare commands');
  /*
   * Workaround for linking the cli tool as different executables.
   * So it can be called as `install-tool node 1.2.3`.
   */
  if (mode == 'install-tool') {
    cli.register(InstallToolLegacyShortCommand);
    cli.register(InstallToolNodeShortCommand);
    return prepareToolVersion(mode, args);
  }

  cli.register(InstallToolLegacyCommand);
  cli.register(InstallToolNodeCommand);
  return prepareToolVersion(mode, args);
}
