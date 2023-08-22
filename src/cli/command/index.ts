import { argv0 } from 'node:process';
import type { Cli } from 'clipanion';
import type { CliMode } from '../utils';
import { logger } from '../utils/logger';
import { DownloadFileCommand } from './download-file';
import { InstallNpmCommand, InstallNpmShortCommand } from './install-npm';
import { InstallToolCommand, InstallToolShortCommand } from './install-tool';
import { PrepareToolCommand, PrepareToolShortCommand } from './prepare-tool';
import { prepareToolVersion } from './utils';

export function prepareCommands(
  cli: Cli,
  mode: CliMode | null,
  args: string[],
): string[] {
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
    return prepareToolVersion(mode, args);
  } else if (mode === 'prepare-tool') {
    cli.register(PrepareToolShortCommand);
    return args;
  } else if (mode === 'install-npm') {
    cli.register(InstallNpmShortCommand);
    return prepareToolVersion(mode, args);
  }

  cli.register(DownloadFileCommand);
  cli.register(InstallNpmCommand);
  cli.register(InstallToolCommand);
  cli.register(PrepareToolCommand);

  return prepareToolVersion(mode, args);
}

export function parseBinaryName(
  mode: CliMode | null,
  node: string,
  app: string,
): string | undefined {
  if (mode) {
    return mode;
  }

  return argv0.endsWith('/node') || argv0 === 'node' ? `${node} ${app}` : argv0;
}
