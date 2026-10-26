import { Command, Option } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { cleanupCache } from '../cleanup/index.ts';
import { logger } from '../utils/index.ts';
import { command } from './utils.ts';

@command('containerbase-cli')
export class CleanupCacheCommand extends Command {
  static override paths = [['cleanup', 'cache']];

  static override usage = Command.Usage({
    description:
      'Removes the known tool caches from `/tmp/containerbase/cache`.',
    examples: [
      ['Removes all known tool caches', '$0 cleanup cache'],
      ['Lists the caches which would be removed', '$0 cleanup cache --dry-run'],
    ],
  });

  dryRun = Option.Boolean('-d,--dry-run', false);

  /** Removes the known tool caches, returning a non-zero exit code on failure. */
  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info('Cleanup cache ...');
    try {
      await cleanupCache(this.dryRun);
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
          `Cleanup cache failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Cleanup cache succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
