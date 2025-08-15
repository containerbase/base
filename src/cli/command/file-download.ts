import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { version } from 'node:process';
import { pipeline } from 'node:stream/promises';
import { Command, Option } from 'clipanion';
import { got } from 'got';
import prettyMilliseconds from 'pretty-ms';
import { EnvService, createContainer } from '../services';
import { logger } from '../utils';

export class FileDownloadCommand extends Command {
  static override paths = [['file', 'download'], ['fd']];

  static override usage = Command.Usage({
    description: 'Downloads a file.',
  });

  url = Option.String();
  output = Option.String();

  // checksum = Option.String('-c,--checksum');
  // algo = Option.String('-a,--algo');

  // dryRun = Option.Boolean('-d,--dry-run', false);

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info({ url: this.url, output: this.output }, `Downloading file ...`);
    try {
      const container = createContainer();

      const env = container.get(EnvService);
      const path = dirname(this.output);

      await mkdir(path, { recursive: true });

      const nUrl = env.replaceUrl(this.url);
      await pipeline(
        got.stream(nUrl, {
          headers: {
            'user-agent': `containerbase/${
              env.version
            } node/${version.replace(/^v/, '')} (https://github.com/containerbase)`,
          },
        }),
        createWriteStream(this.output),
      );
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
          `Download failed in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      } else {
        logger.info(
          `Download succeded in ${prettyMilliseconds(Date.now() - start)}.`,
        );
      }
    }
  }
}

export class DownloadFileCommand extends FileDownloadCommand {
  static override paths = [['download', 'file'], ['df']];

  static override usage = Command.Usage({
    description: 'Deprecated. Use `file download` command instead.',
  });

  // Override the execute method to maintain compatibility with existing code
  override execute(): Promise<number | void> {
    logger.debug(
      'DownloadFileCommand is deprecated. Use FileDownloadCommand instead.',
    );
    return super.execute();
  }
}
