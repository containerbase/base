import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { prepareTools } from '../prepare-tool';
import { logger } from '../utils';

export class PrepareToolCommand extends Command {
  static override paths = [['prepare', 'tool'], ['pt']];

  static override usage = Command.Usage({
    description: 'Prepares a tool into the container.',
    examples: [
      ['Prepares node', '$0 prepare tool node'],
      ['Prepares all tools', '$0 prepare tool all'],
    ],
  });

  tools = Option.Rest({ required: 1 });

  dryRun = Option.Boolean('-d,--dry-run', false);

  async execute(): Promise<number | void> {
    const start = Date.now();
    logger.info(`Preparing tools ${this.tools.join(', ')}...`);
    try {
      return await prepareTools(this.tools, this.dryRun);
    } catch (err) {
      logger.fatal(err);
      return 1;
    } finally {
      logger.info(
        `Prepared tools ${this.tools.join(', ')} in ${prettyMilliseconds(
          Date.now() - start
        )}ms.`
      );
    }
  }
}

export class PrepareToolShortCommand extends PrepareToolCommand {
  static override paths = [];

  static override usage = Command.Usage({
    description: 'Prepares a tool into the container.',
    examples: [
      ['Prepares node', '$0 node'],
      ['Prepares all tools', '$0'],
    ],
  });
}
