import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Command, Option } from 'clipanion';
import { got } from 'got';
import prettyMilliseconds from 'pretty-ms';
import { EnvService, rootContainer } from '../services';
import { logger } from '../utils';

export class DownloadFileCommand extends Command {
  static override paths = [['download', 'file'], ['df']];

  static override usage = Command.Usage({
    description: 'Downloads a file and optionally validates the checksum.',
  });

  url = Option.String({ required: true });
  output = Option.String({ required: true });

  // checksum = Option.String('-c,--checksum');
  // algo = Option.String('-a,--algo');

  // dryRun = Option.Boolean('-d,--dry-run', false);

  async execute(): Promise<number | void> {
    const start = Date.now();
    let error = false;
    logger.info({ url: this.url, output: this.output }, `Downloading file ...`);
    try {
      const container = rootContainer.createChild();

      const env = container.get(EnvService);
      const path = dirname(this.output);

      await rm(this.output, { force: true });
      await mkdir(path, { recursive: true });

      const nUrl = env.replaceUrl(this.url);
      await pipeline(got.stream(nUrl), createWriteStream(this.output));

      return 0;
    } catch (err) {
      logger.fatal(err);
      error = true;
      return 1;
    } finally {
      logger.info(
        `Download completed ${
          error ? 'with errors ' : ''
        } in ${prettyMilliseconds(Date.now() - start)}.`
      );
    }
  }
}
