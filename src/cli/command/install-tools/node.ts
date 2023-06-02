import { Command, Option } from 'clipanion';
import { execa } from 'execa';
import * as t from 'typanion';
import { logger, validateSemver } from '../../utils';

export class InstallToolNodeCommand extends Command {
  static override paths = [
    ['install', 'tool', 'node'],
    ['it', 'node'],
  ];

  static override usage = Command.Usage({
    description: 'Installs Node.js into the container.',
    examples: [
      ['Installs node 14.17.0', '$0 install tool node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 install tool node',
      ],
    ],
  });

  version = Option.String({
    required: true,
    validator: t.cascade(t.isString(), validateSemver()),
  });

  async execute(): Promise<number | void> {
    logger.info(`Installing node v${this.version}...`);
    await execa(
      '/usr/local/containerbase/bin/install-tool',
      ['node', this.version],
      {
        stdio: 'inherit',
      }
    );
  }
}

export class InstallToolNodeShortCommand extends InstallToolNodeCommand {
  static override paths = [['node']];

  static override usage = Command.Usage({
    description: 'Installs Node.js into the container.',
    examples: [
      ['Installs node v14.17.0', '$0 node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 $0 node',
      ],
    ],
  });
}
