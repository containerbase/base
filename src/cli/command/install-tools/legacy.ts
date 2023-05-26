import { Command, Option } from 'clipanion';
import { execa } from 'execa';
import { logger } from '../../utils';

export class InstallToolLegacyCommand extends Command {
  static paths = [['install', 'tool'], ['it']];

  static usage = Command.Usage({
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

  version = Option.String({ required: true });

  async execute(): Promise<number | void> {
    logger.info(`Installing legacy tool ${this.name} v${this.version}...`);
    await execa(
      '/usr/local/buildpack/install-tool',
      [this.name, this.version],
      {
        stdio: 'inherit',
      }
    );
  }
}

export class InstallToolLegacyShortCommand extends InstallToolLegacyCommand {
  static paths = [];

  static usage = Command.Usage({
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
