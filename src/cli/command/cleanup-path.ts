import { Command, Option } from 'clipanion';
import { deleteAsync } from 'del';
import prettyMilliseconds from 'pretty-ms';
import { logger } from '../utils';

export class CleanupPathCommand extends Command {
  static override paths = [['cleanup', 'path']];

  static override usage = Command.Usage({
    description: 'Cleanup passed paths.',
    examples: [
      [
        'Cleanup multiple paths',
        '$0 cleanup path "/tmp/**:/var/tmp" "/some/paths/**"',
      ],
    ],
  });

  cleanupPaths = Option.Rest({ required: 1 });

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    const paths = this.cleanupPaths.flatMap((p) => p.split(':'));
    logger.info({ paths }, `Cleanup paths ...`);
    try {
      const deleted = await deleteAsync(paths, { dot: true });
      logger.debug({ deleted }, 'Deleted paths');
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
          `Cleanup failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Cleanup succeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
