import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { version } from 'node:process';
import { pipeline } from 'node:stream/promises';
import { HTTPError, type OptionsInit, got } from 'got';
import { inject, injectable } from 'inversify';
import { logger } from '../utils';
import { hash, hashFile } from '../utils/hash';
import { EnvService } from './env.service';
import { PathService } from './path.service';

export type HttpChecksumType =
  | 'sha1'
  | 'sha224'
  | 'sha256'
  | 'sha384'
  | 'sha512';

export interface HttpDownloadConfig {
  url: string;
  expectedChecksum?: string | undefined;
  checksumType?: HttpChecksumType | undefined;
  fileName?: string;
}

@injectable()
export class HttpService {
  private _opts: Pick<OptionsInit, 'headers'>;
  constructor(
    @inject(EnvService) private envSvc: EnvService,
    @inject(PathService) private pathSvc: PathService,
  ) {
    this._opts = {
      headers: {
        'user-agent': `containerbase/${
          this.envSvc.version
        } node/${version.replace(/^v/, '')} (https://github.com/containerbase)`,
      },
    };
  }

  async download({
    url,
    expectedChecksum,
    checksumType,
    fileName,
  }: HttpDownloadConfig): Promise<string> {
    logger.debug({ url, expectedChecksum, checksumType }, 'downloading file');

    const urlChecksum = hash(url, 'sha256');

    const cacheDir = this.envSvc.cacheDir ?? this.pathSvc.tmpDir;
    const cachePath = join(cacheDir, urlChecksum);
    // TODO: validate name
    const file = fileName ?? new URL(url).pathname.split('/').pop()!;
    const filePath = join(cachePath, file);

    if (await this.pathSvc.fileExists(filePath)) {
      if (expectedChecksum && checksumType) {
        const actualChecksum = await hashFile(filePath, checksumType);

        if (actualChecksum === expectedChecksum) {
          return filePath;
        } else {
          logger.debug(
            { url, expectedChecksum, actualChecksum, checksumType },
            'checksum mismatch',
          );
        }
      } else {
        return filePath;
      }
    }

    await mkdir(cachePath, { recursive: true });

    const nUrl = this.envSvc.replaceUrl(url);

    for (const run of [1, 2, 3]) {
      try {
        await pipeline(
          got.stream(nUrl, this._opts),
          createWriteStream(filePath),
        );
        if (expectedChecksum && checksumType) {
          const actualChecksum = await hashFile(filePath, checksumType);

          if (actualChecksum === expectedChecksum) {
            return filePath;
          } else {
            logger.debug(
              { url, expectedChecksum, actualChecksum, checksumType },
              'checksum mismatch',
            );
            throw new Error('checksum mismatch');
          }
        }
        return filePath;
      } catch (err) {
        if (run === 3) {
          logger.error({ err, run }, 'download failed');
        } else {
          logger.debug({ err, run }, 'download failed');
        }
      }
    }
    await rm(cachePath, { recursive: true });
    throw new Error('download failed');
  }

  async exists(url: string): Promise<boolean> {
    try {
      await got.head(url, this._opts);
      return true;
    } catch (err) {
      if (err instanceof HTTPError && err.response?.statusCode === 404) {
        return false;
      }

      logger.error({ err, url }, 'failed to check url');
      throw err;
    }
  }
}
