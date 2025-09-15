import process from 'node:process';
import type { Cli, CommandClass } from 'clipanion';
import type { CliMode } from '../utils';
import { InvalidCommand } from '../utils/codes';
import { logger } from '../utils/logger';
import { CleanupPathCommand } from './cleanup-path';
import { DownloadFileCommand, FileDownloadCommand } from './file-download';
import { FileExistsCommand } from './file-exists';
import { InitToolCommand } from './init-tool';
import { InstallGemCommand, InstallGemShortCommand } from './install-gem';
import { InstallNpmCommand, InstallNpmShortCommand } from './install-npm';
import { InstallPipCommand, InstallPipShortCommand } from './install-pip';
import { InstallToolCommand, InstallToolShortCommand } from './install-tool';
import { LinkToolCommand } from './link-tool';
import { PrepareToolCommand, PrepareToolShortCommand } from './prepare-tool';

const commands: Record<CliMode, CommandClass | CommandClass[]> = {
  'containerbase-cli': [
    CleanupPathCommand,
    DownloadFileCommand,
    FileDownloadCommand,
    FileExistsCommand,
    InitToolCommand,
    InstallGemCommand,
    InstallNpmCommand,
    InstallPipCommand,
    InstallToolCommand,
    LinkToolCommand,
    PrepareToolCommand,
  ],
  'install-gem': InstallGemShortCommand,
  'install-npm': InstallNpmShortCommand,
  'install-pip': InstallPipShortCommand,
  'install-tool': InstallToolShortCommand,
  'prepare-tool': PrepareToolShortCommand,
};

function register(mode: CliMode, cli: Cli): void {
  const cmds = commands[mode];
  for (const cmd of Array.isArray(cmds) ? cmds : [cmds]) {
    cli.register(cmd);
  }
}

export function prepareCommands(cli: Cli, mode: CliMode | null): void {
  logger.debug('prepare commands');
  if (!mode) {
    register('containerbase-cli', cli);
  } else if (mode in commands) {
    register(mode, cli);
  } else {
    logger.fatal(`Unknown CLI mode: ${mode}`);
    process.exit(InvalidCommand);
  }
}
