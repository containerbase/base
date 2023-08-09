import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import * as t from 'typanion';
import { installTool } from '../install-tool';
import { logger, validateVersion } from '../utils';

export class InstallToolCommand extends Command {
  static override paths = [['install', 'tool'], ['it']];

  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      ['Installs node 14.17.0', '$0 install tool node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 install tool node',
      ],
    ],
  });

  name = Option.String({ required: true });

  version = Option.String({
    required: true,
    validator: t.cascade(t.isString(), validateVersion()),
  });

  dryRun = Option.Boolean('-d,--dry-run', false);

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;

    logger.info(`Installing tool ${this.name} v${this.version}...`);
    try {
      return await installTool(this.name, this.version, this.dryRun);
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
  static override paths = [];

  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      ['Installs node v14.17.0', '$0 node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 node',
      ],
    ],
  });
}
