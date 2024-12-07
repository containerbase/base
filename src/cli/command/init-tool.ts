import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { initializeTools } from '../prepare-tool';
import { logger } from '../utils';

export class InitToolCommand extends Command {
  static override paths = [['init', 'tool']];

  static override usage = Command.Usage({
    description:
      'Initialize a tool into the container. This creates missing files and directories.',
    examples: [
      ['Initialize node', '$0 init tool node'],
      ['Initialize all prepared tools', '$0 init tool all'],
    ],
  });

  tools = Option.Rest({ required: 1 });

  dryRun = Option.Boolean('-d,--dry-run', false);

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info(`Initializing tools ${this.tools.join(', ')}...`);
    try {
      return await initializeTools(this.tools, this.dryRun);
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.fatal(err.message);
      }
      return 1;
    } finally {
      if (error) {
        logger.fatal(
          `Initialize tools ${this.tools.join(', ')} failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Initialize tools ${this.tools.join(', ')} succeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
