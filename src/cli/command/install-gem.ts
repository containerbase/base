import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import * as t from 'typanion';
import { installTool } from '../install-tool';
import { logger, validateVersion } from '../utils';
import { getVersion } from './utils';

export class InstallGemEnvCommand extends Command {
  static override paths = [['install', 'gem']];

  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [
      [
        'Installs rake with version via environment variable',
        'RAKE_VERSION=13.0.6 $0 install gem rake',
      ],
    ],
  });

  name = Option.String();

  dryRun = Option.Boolean('-d,--dry-run', false);

  override async execute(): Promise<number | void> {
    const version = getVersion(this.name);

    if (!version) {
      logger.fatal(`No version found for ${this.name}`);
      return 1;
    }

    return await this.cli.run([
      ...this.path,
      ...(this.dryRun ? ['-d'] : []),
      this.name,
      version,
    ]);
  }
}

export class InstallGemCommand extends InstallGemEnvCommand {
  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [['Installs rake 13.0.6', '$0 install gem rake 13.0.6']],
  });

  version = Option.String({
    required: true,
    validator: t.cascade(t.isString(), validateVersion()),
  });

  override async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;

    logger.info(`Installing gem package ${this.name} v${this.version}...`);
    try {
      return await installTool(this.name, this.version, this.dryRun, 'gem');
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

export class InstallGemShortEnvCommand extends InstallGemEnvCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [
      [
        'Installs rake with version via environment variable',
        'RAKE_VERSION=13.0.6 $0 rake',
      ],
    ],
  });
}

export class InstallGemShortCommand extends InstallGemCommand {
  static override paths = [Command.Default];

  static override usage = Command.Usage({
    description: 'Installs a gem package into the container.',
    examples: [['Installs rake v13.0.6', '$0 rake 13.0.6']],
  });
}
