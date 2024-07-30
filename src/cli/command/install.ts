import { Command } from 'clipanion';
import prettyMilliseconds from 'pretty-ms';
import { EnvService, rootContainer } from '../services';
import { logger } from '../utils';

export class InstallCommand extends Command {
  static override paths = [['install']];

  static override usage = Command.Usage({
    description: 'Downloads a file and optionally validates the checksum.',
  });

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info(`Instaling containerbase ...`);
    try {
      const container = rootContainer.createChild();

      const env = container.get(EnvService);

      await Promise.resolve(env);

      return 0;
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.error(err.message);
      }
      return 1;
    } finally {
      if (error) {
        logger.fatal(
          `Install failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Install succeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
