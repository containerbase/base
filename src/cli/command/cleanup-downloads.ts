import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { cleanupDownloads } from '../cleanup/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class CleanupDownloadsCommand extends Command {
  static override paths = [['cleanup', 'downloads']];

  static override usage = Command.Usage({
    description:
      'Evicts the oldest files from `CONTAINERBASE_CACHE_DIR` down to `CONTAINERBASE_MAX_ALLOCATED_DISK`.',
    examples: [
      ['Evicts the oldest downloads', '$0 cleanup downloads'],
      [
        'Logs the oldest download which would be removed',
        '$0 cleanup downloads --dry-run',
      ],
    ],
  });

  dryRun = Option.Boolean('-d,--dry-run', false);

  /**
   * Evicts the oldest files from the download cache, returning a non-zero exit
   * code on failure.
   */
  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info('Cleanup downloads ...');
    try {
      await cleanupDownloads(this.dryRun);
      return 0;
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
          `Cleanup downloads failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Cleanup downloads succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
