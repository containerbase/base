import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import * as t from 'typanion';
import { installTool } from '../install-tool';
import { logger, validateVersion } from '../utils';
import { getVersion } from './utils';

abstract class InstallToolBaseCommand extends Command {
  static override paths = [['install', 'tool'], ['it']];

  name = Option.String();

  dryRun = Option.Boolean('-d,--dry-run', false);
}

export class InstallToolEnvCommand extends InstallToolBaseCommand {
  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 install tool node',
      ],
    ],
  });

  override async execute(): Promise<number | void> {
    const version = getVersion(this.name);

    if (!version) {
      logger.fatal(`No version found for ${this.name}`);
      return 1;
    }

    logger.debug("Forwarding to 'install tool' command");
    return await this.cli.run([
      ...this.path,
      ...(this.dryRun ? ['-d'] : []),
      this.name,
      version,
    ]);
  }
}

export class InstallToolCommand extends InstallToolBaseCommand {
  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [['Installs node 14.17.0', '$0 install tool node 14.17.0']],
  });

  version = Option.String({
    validator: t.cascade(t.isString(), validateVersion()),
  });

  override async execute(): Promise<number | void> {
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

export class InstallToolShortEnvCommand extends InstallToolEnvCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 node',
      ],
    ],
  });
}

export class InstallToolShortCommand extends InstallToolCommand {
  static override paths = [Command.Default];
  static override usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [['Installs node v14.17.0', '$0 node 14.17.0']],
  });
}
