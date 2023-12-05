import { Command } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { installTool } from '../install-tool';
import { logger } from '../utils';
import { InstallToolBaseCommand } from './utils';

export class InstallGemCommand extends InstallToolBaseCommand {
  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [
      ['Installs rake 13.0.6', '$0 install gem rake 13.0.6'],
      [
        'Installs rake with version via environment variable',
        'RAKE_VERSION=13.0.6 $0 install gem rake',
      ],
      // ['Installs latest rake version', '$0 install gem rake'], // not yet supported
    ],
  });

  override async _execute(version: string | undefined): Promise<number | void> {
    const start = Date.now();
    let error = false;

    logger.info(
      `Installing gem package ${this.name}@${version ?? 'latest'}...`,
    );
    try {
      return await installTool(this.name, version, this.dryRun, 'gem');
    } catch (err) {
      logger.fatal(err);
      error = true;
      return 1;
    } finally {
      logger.info(
        `Installed gem package ${this.name} ${
          error ? 'with errors ' : ''
        }in ${prettyMilliseconds(Date.now() - start)}.`,
      );
    }
  }
}

export class InstallGemShortCommand extends InstallGemCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [
      ['Installs rake v13.0.6', '$0 rake 13.0.6'],
      [
        'Installs rake with version via environment variable',
        'RAKE_VERSION=13.0.6 $0 rake',
      ],
      // ['Installs latest rake version', '$0 rake'], // not yet supported
    ],
  });
}
