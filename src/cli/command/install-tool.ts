import { Command } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { installTool } from '../install-tool';
import { logger } from '../utils';
import { InstallToolBaseCommand } from './utils';

export class InstallToolCommand extends InstallToolBaseCommand {
  static override paths = [['install', 'tool'], ['it']];

  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      ['Installs node 14.17.0', '$0 install tool node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 install tool node',
      ],
      ['Installs latest pnpm version', '$0 install tool pnpm'],
    ],
  });

  override async _execute(version: string | undefined): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info(`Installing tool ${this.name}@${version ?? 'latest'}...`);
    try {
      return await installTool(this.name, version, this.dryRun);
    } catch (err) {
      logger.fatal(err);
      error = true;
      return 1;
    } finally {
      logger.info(
        `Installed tool ${this.name} ${
          error ? 'with errors ' : ''
        }in ${prettyMilliseconds(Date.now() - start)}.`,
      );
    }
  }
}

export class InstallToolShortCommand extends InstallToolCommand {
  static override paths = [Command.Default];
  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      ['Installs node v14.17.0', '$0 node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 node',
      ],
      ['Installs latest pnpm version', '$0 pnpm'],
    ],
  });
}
