import type { Cli } from 'clipanion';
import type { CliMode } from '../utils';
import { logger } from '../utils/logger';
import './cleanup-path';
import './file-download';
import './file-exists';
import './init-tool';
import './install-gem';
import './install-npm';
import './install-pip';
import './install-tool';
import './link-tool';
import './prepare-tool';
import { getCommands } from './utils';

export function prepareCommands(cli: Cli, mode: CliMode | null): void {
  logger.debug('prepare commands');
  for (const command of getCommands(mode ?? 'containerbase-cli')) {
    cli.register(command);
  }
}
