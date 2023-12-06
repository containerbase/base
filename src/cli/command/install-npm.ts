import { Command } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { installTool } from '../install-tool';
import { logger } from '../utils';
import { InstallToolBaseCommand } from './utils';

export class InstallNpmCommand extends InstallToolBaseCommand {
  static override paths = [['install', 'npm']];
  static override usage = Command.Usage({
    description: 'Installs a npm package into the container.',
    examples: [
      ['Installs del-cli 5.0.0', '$0 install npm del-cli 5.0.0'],
      [
        'Installs del-cli with version via environment variable',
        'DEL_CLI_VERSION=5.0.0 $0 install npm del-cli',
      ],
      ['Installs latest del-cli version', '$0 install npm del-cli'],
    ],
  });

  override async _execute(version: string): Promise<number | void> {
    const start = Date.now();
    let error = false;

    logger.info(`Installing npm package ${this.name}@${version}...`);
    try {
      return await installTool(this.name, version, this.dryRun, 'npm');
    } catch (err) {
      logger.fatal(err);
      error = true;
      return 1;
    } finally {
      logger.info(
        `Installed npm package ${this.name} ${
          error ? 'with errors ' : ''
        }in ${prettyMilliseconds(Date.now() - start)}.`,
      );
    }
  }
}

export class InstallNpmShortCommand extends InstallNpmCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a npm package into the container.',
    examples: [
      ['Installs del-cli v5.0.0', '$0 del-cli 5.0.0'],
      [
        'Installs del-cli with version via environment variable',
        'DEL_CLI_VERSION=5.0.0 $0 del-cli',
      ],
      ['Installs latest del-cli version', '$0 del-cli'],
    ],
  });
}
