import is from '@sindresorhus/is';
import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import * as t from 'typanion';
import { type InstallToolType, installTool } from '../install-tool';
import { logger, validateVersion } from '../utils';
import { getVersion } from './utils';

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
      ['Installs latest pnpm version', '$0 install tool pnpm'],
    ],
  });

  name = Option.String();

  dryRun = Option.Boolean('-d,--dry-run', false);

  version = Option.String({
    validator: t.cascade(t.isString(), validateVersion()),
    required: false,
  });

  protected type: InstallToolType | undefined;

  override async execute(): Promise<number | void> {
    let version = this.version;

    if (!is.nonEmptyStringAndNotWhitespace(version)) {
      version = getVersion(this.name);
    }

    if (!is.nonEmptyStringAndNotWhitespace(version)) {
      logger.debug(`No version found for ${this.name}`);
    }

    const start = Date.now();
    let error = false;
    logger.info(
      `Installing ${this.type ?? 'tool'} ${this.name}@${
        version ?? 'latest'
      }...`,
    );
    try {
      return await installTool(this.name, version, this.dryRun, this.type);
    } catch (err) {
      logger.fatal(err);
      error = true;
      return 1;
    } finally {
      logger.info(
        `Installed ${this.type ?? 'tool'} ${this.name} ${
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
