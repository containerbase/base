import { Command, Option } from 'clipanion';
import { execa } from 'execa';

export class InstallToolCommand extends Command {
  static paths = [['install', 'tool'], ['it']];

  static usage = Command.Usage({
    description: 'Installs a tool into the container.',
    examples: [
      ['Installs node 14.17.0', 'containerbase-cli install tool node 14.17.0'],
      ['Installs node via short tool helper', 'install-tool node 14.17.0'],
      [
        'Installs node with version via environment variable',
        'NODE_VERSION=14.17.0 install-tool node',
      ],
    ],
  });

  name = Option.String({ required: true });

  version = Option.String({ required: false });

  async execute(): Promise<number | void> {
    const args = [this.name];

    if (this.version) {
      args.push(this.version);
    }

    await execa('/usr/local/buildpack/install-tool', args, {
      stdio: 'inherit',
    });
  }
}
