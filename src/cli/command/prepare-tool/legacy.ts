import { Command, Option } from 'clipanion';
import { execa } from 'execa';
import { logger } from '../../utils';

export class PrepareToolLegacyCommand extends Command {
  static paths = [['prepare', 'tool'], ['pt']];

  static usage = Command.Usage({
    description: 'Prepares a tool into the container.',
    examples: [
      ['Prepares node', '$0 prepare tool node'],
      ['Prepares all tools', '$0 prepare tool all'],
    ],
  });

  tools = Option.Rest({ required: 1 });

  async execute(): Promise<number | void> {
    logger.info(`Preparing legacy tools ${this.tools.join(', ')} ...`);
    await execa('/usr/local/buildpack/prepare-tool', this.tools, {
      stdio: 'inherit',
    });
  }
}

export class PrepareToolLegacyShortCommand extends PrepareToolLegacyCommand {
  static paths = [];

  static usage = Command.Usage({
    description: 'Prepares a tool into the container.',
    examples: [
      ['Prepares node', '$0 node'],
      ['Prepares all tools', '$0'],
    ],
  });
}
