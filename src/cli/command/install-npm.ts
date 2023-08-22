import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import * as t from 'typanion';
import { installTool } from '../install-tool';
import { logger, validateVersion } from '../utils';

export class InstallNpmCommand extends Command {
  static override paths = [['install', 'npm']];

  static override usage = Command.Usage({
    description: 'Installs a npm package into the container.',
    examples: [
      ['Installs corepack 0.9.0', '$0 install npm corepack 0.9.0'],
      [
        'Installs corepack with version via environment variable',
        'COREPACK_VERSION=0.9.0 $0 install npm corepack',
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

    logger.info(`Installing npm package ${this.name} v${this.version}...`);
    try {
      return await installTool(this.name, this.version, this.dryRun, 'npm');
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
  static override paths = [];

  static override usage = Command.Usage({
    description: 'Installs a npm package into the container.',
    examples: [
      ['Installs corepack v0.9.0', '$0 corepack 0.9.0'],
      [
        'Installs corepack with version via environment variable',
        'NODE_VERSION=0.9.0 $0 corepack',
      ],
    ],
  });
}
