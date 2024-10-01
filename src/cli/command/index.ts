import type { Cli } from 'clipanion';
import type { CliMode } from '../utils';
import { logger } from '../utils/logger';
import { DownloadFileCommand } from './download-file';
import { InitToolCommand } from './init-tool';
import { InstallGemCommand, InstallGemShortCommand } from './install-gem';
import { InstallNpmCommand, InstallNpmShortCommand } from './install-npm';
import { InstallPipCommand, InstallPipShortCommand } from './install-pip';
import { InstallToolCommand, InstallToolShortCommand } from './install-tool';
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
    return;
  } else if (mode === 'prepare-tool') {
    cli.register(PrepareToolShortCommand);
    return;
  } else if (mode === 'install-npm') {
    cli.register(InstallNpmShortCommand);
    return;
  } else if (mode === 'install-gem') {
    cli.register(InstallGemShortCommand);
    return;
  } else if (mode === 'install-pip') {
    cli.register(InstallPipShortCommand);
    return;
  }

  cli.register(DownloadFileCommand);
  cli.register(InstallGemCommand);
  cli.register(InstallNpmCommand);
  cli.register(InstallPipCommand);
  cli.register(InstallToolCommand);
  cli.register(PrepareToolCommand);
  cli.register(InitToolCommand);
}
