import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { version } from 'node:process';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import merge from 'deepmerge';
import got, {
  HTTPError,
  type OptionsInit,
  type OptionsOfJSONResponseBody,
  type OptionsOfTextResponseBody,
  ParseError,
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

/**
 * The wait in milliseconds before the second attempt of
 * {@link HttpService.get} after a network error or timeout, it doubles before
 * each further attempt.
 */
export const retryDelay = 1_000;

/**
 * The got timeouts of a version lookup of a resolver in milliseconds, per
 * request. A timeout is not retried by got, see {@link lookupOptions}, so an
 * unreachable or stalled host fails fast instead of blocking an install: with
 * the three attempts of {@link HttpService.get} and the 1 s and 2 s waits
 * between them an unresolvable host gives up after about 21 s, an unreachable
 * one after about 18 s and one which never answers after about 33 s, plus the
 * TLS handshakes. A host which refuses the connection fails after about 3 s.
 * There is no overall cap,
 * so large metadata still loads on slow links as long as data flows. Not for
 * the downloads of tool files.
 */
export const lookupTimeout = {
  /**
   * resolving the host, above the 5 s glibc waits for a nameserver, so a
   * dropped AAAA query doesn't fail the lookup
   */
  lookup: 6_000,
  /** opening the connection, short so dropped packets fail fast */
  connect: 5_000,
  /** the TLS handshake */
  secureConnect: 5_000,
  /** waiting for the response after the request was sent */
  response: 10_000,
  /** an idle socket, without any data */
  socket: 10_000,
} as const;

/**
 * The got options of a version lookup: the {@link lookupTimeout}, and got
 * retries only the retryable status codes like 429 and 503, twice, with its
 * backoff of 1 s and 2 s or the `Retry-After` of the server, up to 30 s; a
 * longer `Retry-After` fails the lookup right away. Network errors and
 * timeouts are not retried by got, the three attempts of
 * {@link HttpService.get}, 1 s and 2 s apart, cover them, while it doesn't
 * repeat a status error.
 *
 * So a host which keeps failing with a retryable status gets three requests,
 * and the lookup waits about 3 s between them, or up to 60 s when the host
 * asks for the longest `Retry-After`.
 */
export const lookupOptions: Readonly<
  Pick<OptionsOfJSONResponseBody, 'timeout' | 'retry'>
> = {
  timeout: lookupTimeout,
  retry: { limit: 2, errorCodes: [], maxRetryAfter: 30_000 },
};

/**
 * The got timeouts of a tool-versions lookup in milliseconds: the phases of
 * {@link lookupTimeout} and a cap of the whole request, the files are small.
 * They are fetched with a single attempt, which also disables got's retries,
 * so a lookup gives up after at most 30 s.
 */
export const toolVersionsTimeout = {
  ...lookupTimeout,
  /** the whole request */
  request: 30_000,
} as const;

export interface HttpDownloadConfig {
  url: string;
  expectedChecksum?: string | undefined;
  checksumType?: HttpChecksumType | undefined;
  fileName?: string;
}

/** How a request is run, see {@link HttpService.getJson}. */
export interface HttpRequestConfig {
  attempts?: number;
  quiet?: boolean;
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
   * Fetches the body as text, see {@link _request}: a network error or
   * timeout gets up to three attempts by default, 1 s and 2 s apart, each of
   * them with got's own retries unless `opts` turns them off like
   * {@link lookupOptions}. An error status is only retried by got.
   *
   * @param request - how the request is run, like {@link getJson}
   * @throws the original HTTP error for an error status, without trying again
   * @throws `download failed` after the failed attempts otherwise
   */
  async get(
    url: string,
    opts: OptionsOfTextResponseBody = {},
    request: HttpRequestConfig = {},
  ): Promise<string> {
    return await this._request(url, opts, (req) => req.text(), request);
  }

  /**
   * Fetches and parses a json body, see {@link _request}: a network error or
   * timeout gets up to three attempts by default, 1 s and 2 s apart, each of
   * them with got's own retries unless `opts` turns them off like
   * {@link lookupOptions}. An error status is only retried by got, an invalid
   * body not at all. The result is not validated, parse it with a schema.
   *
   * @param opts - the got options, eg. a `timeout`
   * @param request - `attempts` is how often to try, at least once, and one
   * also disables got's own retries. `quiet` logs a failure at debug level
   * instead of error, for a request which is allowed to fail.
   * @throws the original HTTP error for an error status, without trying again
   * @throws the original parse error for an invalid json body, without trying
   * again
   * @throws `download failed` after the failed attempts otherwise
   */
  async getJson<T = unknown>(
    url: string,
    opts: OptionsOfJSONResponseBody = {},
    request: HttpRequestConfig = {},
  ): Promise<T> {
    return await this._request(url, opts, (req) => req.json<T>(), request);
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
   * Runs a `GET` request and reads its body, trying up to `attempts` times,
   * three by default and at least once. A single attempt also disables got's
   * own retries.
   *
   * An error status is not tried again: got already retried the retryable
   * ones, with its backoff and the `Retry-After` of the server, so it is
   * logged once and the original error is rethrown, like a body which can't
   * be parsed. Only network errors and timeouts are tried again, after a wait
   * of {@link retryDelay} which doubles with each attempt, so 1 s and 2 s by
   * default. Each attempt still has got's own retries of network errors
   * unless `opts` turns them off, like {@link lookupOptions} does, so only
   * then the attempts are three single requests. A final failure is logged at
   * error level, at debug level when `quiet`.
   *
   * @throws the original HTTP error for an error status
   * @throws the original parse error for an invalid json body
   * @throws `download failed`, with the last error as cause, after the failed
   * attempts
   */
  private async _request<T>(
    url: string,
    opts: OptionsOfTextResponseBody | OptionsOfJSONResponseBody,
    read: (req: ReturnType<typeof got.get>) => Promise<T>,
    { attempts = 3, quiet = false }: HttpRequestConfig = {},
  ): Promise<T> {
    const tries = Math.max(1, attempts);
    const finalLevel = quiet ? 'debug' : 'error';
    const nUrl = this.envSvc.replaceUrl(url);
    // a single attempt must not be retried by got either
    const single = tries === 1 ? { retry: { limit: 0 } } : {};
    let lastError: unknown;
    for (let run = 1; run <= tries; run++) {
      try {
        return await read(
          got.get(
            nUrl,
            merge.all([this._opts, opts, single, { resolveBodyOnly: false }]),
          ),
        );
      } catch (err) {
        lastError = err;
        // got already retried the retryable statuses, an invalid body won't
        // change on retry
        if (err instanceof HTTPError || err instanceof ParseError) {
          logger[finalLevel]({ err, url }, 'download failed');
          throw err;
        }
        if (run === tries) {
          logger[finalLevel]({ err, run }, 'download failed');
        } else {
          logger.debug({ err, run }, 'download failed');
          // bridges a short network or proxy outage
          await sleep(retryDelay * 2 ** (run - 1));
        }
      }
    }
    throw new Error('download failed', { cause: lastError });
  }
}
