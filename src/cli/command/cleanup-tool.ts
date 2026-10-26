import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { cleanupTools } from '../cleanup/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class CleanupToolCommand extends Command {
  static override paths = [['cleanup', 'tool']];

  static override usage = Command.Usage({
    description: 'Removes all unlinked tools from `/opt/containerbase/tools`.',
    examples: [
      ['Removes all unlinked tool versions', '$0 cleanup tool'],
      [
        'Logs the tool versions which would be removed',
        '$0 cleanup tool --dry-run',
      ],
    ],
  });

  dryRun = Option.Boolean('-d,--dry-run', false);

  /**
   * Uninstalls the unlinked tool versions, returning a non-zero exit code on
   * failure.
   */
  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info('Cleanup tool ...');
    try {
      const res = await cleanupTools(this.dryRun);
      if (res) {
        error = true;
      }
      return res;
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.error(err.message);
      }
      return 1;
      /* v8 ignore next -- coverage bug */
    } finally {
      if (error) {
        logger.fatal(
          `Cleanup tool failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Cleanup tool succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
