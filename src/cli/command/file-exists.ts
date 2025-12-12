import { version } from 'node:process';
import { Command, Option } from 'clipanion';
import { got } from 'got';
import prettyMilliseconds from 'pretty-ms';
import { EnvService, createContainer } from '../services';
import { logger } from '../utils';
import { command } from './utils';

@command('containerbase-cli')
export class FileExistsCommand extends Command {
  static override paths = [['file', 'exists'], ['fe']];

  static override usage = Command.Usage({
    description: 'Checks if a file exists using a head request.',
  });

  url = Option.String();

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info({ url: this.url }, `Checking if file exists...`);
    try {
      const container = createContainer();

      const env = await container.getAsync(EnvService);
      const nUrl = env.replaceUrl(this.url);
      const res = await got.head(nUrl, {
        throwHttpErrors: false,
        headers: {
          'user-agent': `containerbase/${
            env.version
          } node/${version.replace(/^v/, '')} (https://github.com/containerbase)`,
        },
      });

      if (res.statusCode === 200) {
        return 0;
      }

      logger.error(`status code: ${res.statusCode}`);
      error = true;
      return 1;
    } catch (err) {
      error = true;
      logger.debug(err);
      if (err instanceof Error) {
        logger.error(err.message);
      }
      return -1;
      /* v8 ignore next -- coverage bug */
    } finally {
      if (error) {
        logger.fatal(
          `Check failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Check succeeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}
