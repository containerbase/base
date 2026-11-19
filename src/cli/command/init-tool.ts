import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { setupVolume } from '../install-tool/index.ts';
import { initializeTools } from '../prepare-tool/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
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

  /**
   * Initializes the passed tools, or all prepared tools for `all`. For `all`
   * it first sets up an empty or older `/opt/containerbase` from the
   * build-time list of the image.
   */
  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info(`Initializing tools ${this.tools.join(', ')}...`);
    try {
      if (!this.dryRun && this.tools.length === 1 && this.tools[0] === 'all') {
        await setupVolume();
      }
      return await initializeTools(this.tools, this.dryRun);
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.fatal(err.message);
      }
      return 1;
      /* v8 ignore next -- coverage bug */
    } finally {
      if (error) {
        logger.fatal(
          `Initialize tools ${this.tools.join(', ')} failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Initialize tools ${this.tools.join(', ')} succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
