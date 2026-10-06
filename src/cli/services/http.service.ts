import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { version } from 'node:process';
import { pipeline } from 'node:stream/promises';
import merge from 'deepmerge';
import got, {
  HTTPError,
  type OptionsInit,
  type OptionsOfJSONResponseBody,
  type OptionsOfTextResponseBody,
} from 'got';
import { inject, injectable, postConstruct } from 'inversify';
import { hash, hashFile } from '../utils/hash.ts';
import { logger } from '../utils/index.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';

export const HttpChecksumTypes = [
  'sha1',
  'sha224',
  'sha256',
  'sha384',
  'sha512',
] as const;

export type HttpChecksumType = (typeof HttpChecksumTypes)[number];

export interface HttpDownloadConfig {
  url: string;
  expectedChecksum?: string | undefined;
  checksumType?: HttpChecksumType | undefined;
  fileName?: string;
}

@injectable()
export class HttpService {
  @inject(EnvService)
  private readonly envSvc!: EnvService;

  @inject(PathService)
  private readonly pathSvc!: PathService;

  private readonly _opts: Pick<OptionsInit, 'headers'> = {};

  /** Sets the containerbase user agent for all requests. */
  @postConstruct()
  protected [Symbol('construct')](): void {
    Object.assign(this._opts, {
      headers: {
        'user-agent': `containerbase/${
          this.envSvc.version
        } node/${version.replace(/^v/, '')} (https://github.com/containerbase)`,
      },
    });
  }

  /**
   * Downloads a file into the cache and returns its path.
   *
   * The cache folder is derived from the url, so a file downloaded before is
   * reused, as long as it still matches the expected checksum when one is
   * given. Urls go through the configured url replacements, eg. a CDN. A
   * failed download or checksum mismatch is tried up to three times.
   *
   * @throws when all attempts failed
   */
  async download({
    url,
    expectedChecksum,
    checksumType,
    fileName,
  }: HttpDownloadConfig): Promise<string> {
    logger.debug({ url, expectedChecksum, checksumType }, 'downloading file');

    const urlChecksum = hash(url, 'sha256');

    const cacheDir = this.envSvc.cacheDir ?? this.envSvc.tmpDir;
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

  /**
   * Whether the url exists, checked with a `HEAD` request.
   *
   * @throws on any error other than a 404
   */
  async exists(url: string): Promise<boolean> {
    try {
      await got.head(this.envSvc.replaceUrl(url), this._opts);
      return true;
    } catch (err) {
      if (err instanceof HTTPError && err.response?.statusCode === 404) {
        return false;
      }

      logger.error({ err, url }, 'failed to check url');
      throw err;
    }
  }

  /**
   * Fetches the body as text, trying up to three times. A permanent client
   * error is not retried.
   *
   * @throws the original HTTP error for a permanent 4xx status, without
   * retrying
   * @throws `download failed` after three failed attempts otherwise
   */
  async get(
    url: string,
    opts: OptionsOfTextResponseBody = {},
  ): Promise<string> {
    return await this._request(url, opts, (req) => req.text());
  }

  /**
   * Fetches and parses a json body, trying up to three times. A permanent
   * client error is not retried. The result is not validated, parse it with a
   * schema.
   *
   * @throws the original HTTP error for a permanent 4xx status, without
   * retrying
   * @throws `download failed` after three failed attempts otherwise
   */
  async getJson<T = unknown>(
    url: string,
    opts: OptionsOfJSONResponseBody = {},
  ): Promise<T> {
    return await this._request(url, opts, (req) => req.json<T>());
  }

  /**
   * Like {@link getJson}, but returns `undefined` for a 404.
   *
   * @throws like {@link getJson} for any other error
   */
  async getJsonOrUndefined<T = unknown>(
    url: string,
    opts: OptionsOfJSONResponseBody = {},
  ): Promise<T | undefined> {
    try {
      return await this.getJson<T>(url, opts);
    } catch (err) {
      if (err instanceof HTTPError && err.response.statusCode === 404) {
        return undefined;
      }
      throw err;
    }
  }

  /**
   * Runs a `GET` request and reads its body, trying up to three times.
   *
   * A 4xx status other than 408 and 429 is permanent: it is logged once and
   * the original error is rethrown. Any other failure is retried.
   *
   * @throws the original HTTP error for a permanent 4xx status
   * @throws `download failed`, with the last error as cause, after three
   * failed attempts
   */
  private async _request<T>(
    url: string,
    opts: OptionsOfTextResponseBody | OptionsOfJSONResponseBody,
    read: (req: ReturnType<typeof got.get>) => Promise<T>,
  ): Promise<T> {
    const nUrl = this.envSvc.replaceUrl(url);
    let lastError: unknown;
    for (const run of [1, 2, 3]) {
      try {
        return await read(
          got.get(
            nUrl,
            merge.all([this._opts, opts, { resolveBodyOnly: false }]),
          ),
        );
      } catch (err) {
        lastError = err;
        const status = err instanceof HTTPError ? err.response.statusCode : 0;
        // client errors won't change on retry, except timeouts and rate limits
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          logger.error({ err, url }, 'download failed');
          throw err;
        }
        if (run === 3) {
          logger.error({ err, run }, 'download failed');
        } else {
          logger.debug({ err, run }, 'download failed');
        }
      }
    }
    throw new Error('download failed', { cause: lastError });
  }
}
