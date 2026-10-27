import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { cleanupAll } from '../cleanup/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class CleanupCommand extends Command {
  static override paths = [['cleanup']];

  static override usage = Command.Usage({
    description:
      'Removes the unlinked tools and the tool caches, and evicts the oldest downloads.',
    examples: [
      ['Runs all cleanups', '$0 cleanup'],
      ['Logs what all cleanups would remove', '$0 cleanup --dry-run'],
    ],
  });

  dryRun = Option.Boolean('-d,--dry-run', false);

  /**
   * Runs the tool, cache and downloads cleanups, returning a non-zero exit
   * code when any of them failed or they could not start.
   */
  async execute(): Promise<number | void> {
    const start = Date.now();
    let res = 1;
    try {
      res = await cleanupAll(this.dryRun);
      return res;
    } catch (err) {
      logger.debug(err);
      if (err instanceof Error) {
        logger.error(err.message);
      }
      return res;
      /* v8 ignore next -- coverage bug */
    } finally {
      if (res) {
        logger.fatal(
          `Cleanup failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Cleanup succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
