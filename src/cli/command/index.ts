import type { Cli } from 'clipanion';
import type { CliMode } from '../utils';
import { logger } from '../utils/logger';
import { DownloadFileCommand } from './download-file';
import {
  InstallGemCommand,
  InstallGemEnvCommand,
  InstallGemShortCommand,
  InstallGemShortEnvCommand,
} from './install-gem';
import {
  InstallNpmCommand,
  InstallNpmEnvCommand,
  InstallNpmShortCommand,
  InstallNpmShortEnvCommand,
} from './install-npm';
import {
  InstallToolCommand,
  InstallToolEnvCommand,
  InstallToolShortCommand,
  InstallToolShortEnvCommand,
} from './install-tool';
import { PrepareToolCommand, PrepareToolShortCommand } from './prepare-tool';

export function prepareCommands(cli: Cli, mode: CliMode | null): void {
  logger.debug('prepare commands');
  /*
   * Workaround for linking the cli tool as different executables.
   * So it can be called as
   * - `install-tool node 1.2.3`
   * - `install-npm corepack 1.2.3`
   * - `prepare-tool node`
   */
  if (mode === 'install-tool') {
    cli.register(InstallToolShortCommand);
    cli.register(InstallToolShortEnvCommand);
    return;
  } else if (mode === 'prepare-tool') {
    cli.register(PrepareToolShortCommand);
    return;
  } else if (mode === 'install-npm') {
    cli.register(InstallNpmShortCommand);
    cli.register(InstallNpmShortEnvCommand);
    return;
  } else if (mode === 'install-gem') {
    cli.register(InstallGemShortCommand);
    cli.register(InstallGemShortEnvCommand);
    return;
  }

  cli.register(DownloadFileCommand);
  cli.register(InstallGemCommand);
  cli.register(InstallGemEnvCommand);
  cli.register(InstallNpmCommand);
  cli.register(InstallNpmEnvCommand);
  cli.register(InstallToolCommand);
  cli.register(InstallToolEnvCommand);
  cli.register(PrepareToolCommand);
}
