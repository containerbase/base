import { Command, Option } from 'clipanion';
import { execa } from 'execa';

export class InstallToolCommand extends Command {
  static paths = [['install', 'tool'], ['it']];

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
