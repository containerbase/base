import { once } from 'node:events';
import {
  type AddressInfo,
  type Server,
  type Socket,
  createServer,
} from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import merge from 'deepmerge';
import got, {
  HTTPError,
  type OptionsOfJSONResponseBody,
  ParseError,
} from 'got';
import type { Container } from 'inversify';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { retryDelay } from './http.service.ts';
import {
  HttpService,
  lookupOptions,
  lookupTimeout,
  toolVersionsTimeout,
} from './index.ts';
import { testContainer } from '~test/di.ts';
import { allowNetConnect, scope } from '~test/http-mock.ts';
import { cachePath, rootPath } from '~test/path.ts';

const baseUrl = 'https://example.com';
describe('cli/services/http.service', () => {
  let child!: Container;
  let http!: HttpService;

  beforeEach(async () => {
    child = await testContainer();
    http = await child.getAsync(HttpService);
  });

  test('throws', async () => {
    scope(baseUrl).get('/fail.txt').times(6).reply(404);

    await expect(
      http.download({ url: `${baseUrl}/fail.txt` }),
    ).rejects.toThrow();
    await expect(
      http.download({ url: `${baseUrl}/fail.txt` }),
    ).rejects.toThrow();
  });

  test('throws with checksum', async () => {
    scope(baseUrl).get('/checksum.txt').thrice().reply(200, 'ok');

    const expectedChecksum = 'invalid';
    const checksumType = 'sha256';

    await expect(
      http.download({
        url: `${baseUrl}/checksum.txt`,
        expectedChecksum,
        checksumType,
      }),
    ).rejects.toThrow();
  });

  test('download: falls back to the temp dir without a cache dir', async () => {
    scope(baseUrl).get('/no-cache.txt').reply(200, 'ok');
    vi.stubEnv('CONTAINERBASE_CACHE_DIR', undefined);
    const svc = await (await testContainer()).getAsync(HttpService);

    const file = await svc.download({ url: `${baseUrl}/no-cache.txt` });

    expect(file.startsWith(rootPath('tmp'))).toBe(true);
    expect(file.endsWith('/no-cache.txt')).toBe(true);
  });

  test('download: names the file like the plain file name', async () => {
    scope(baseUrl).get('/named').reply(200, 'ok');

    const file = await http.download({
      url: `${baseUrl}/named`,
      fileName: 'tool-1.0.0.tar.gz',
    });

    expect(file).toMatch(/\/[0-9a-f]+\/tool-1\.0\.0\.tar\.gz$/);
  });

  test.each(['../tool-up.tar.gz', '.tool-hidden.tar.gz', 'sub/tool.tar.gz'])(
    'download: names the file like the url for the file name %s',
    async (fileName) => {
      const path = `/unnamed-${fileName.length}.tar.gz`;
      scope(baseUrl).get(path).reply(200, 'ok');

      const file = await http.download({ url: `${baseUrl}${path}`, fileName });

      expect(file).toMatch(/\/[0-9a-f]+\/unnamed-\d+\.tar\.gz$/);
    },
  );

  test.each([
    { segment: 'tool%2B1.0.tar.gz', name: 'tool+1.0.tar.gz' },
    // decoded, they are no plain file name or no valid encoding
    { segment: 'sub%2Ftool.tar.gz', name: 'sub%2Ftool.tar.gz' },
    { segment: '%2Ehidden.tar.gz', name: '%2Ehidden.tar.gz' },
    { segment: 'tool%E0.tar.gz', name: 'tool%E0.tar.gz' },
  ])(
    'download: names the file $name for the url segment $segment',
    async ({ segment, name }) => {
      scope(baseUrl).get(`/encoded/${segment}`).reply(200, 'ok');

      const file = await http.download({
        url: `${baseUrl}/encoded/${segment}`,
      });

      expect(file.endsWith(`/${name}`)).toBe(true);
    },
  );

  test('download: throws for an url without a file name', async () => {
    await expect(http.download({ url: `${baseUrl}/folder/` })).rejects.toThrow(
      `no file name in url ${baseUrl}/folder/`,
    );
  });

  test('download: names the file for an url without a file name', async () => {
    scope(baseUrl).get('/folder-named/').reply(200, 'ok');

    const file = await http.download({
      url: `${baseUrl}/folder-named/`,
      fileName: 'tool.tar.gz',
    });

    expect(file.endsWith('/tool.tar.gz')).toBe(true);
  });

  test('download', async () => {
    scope(baseUrl).get('/test.txt').reply(200, 'ok');

    const expected = cachePath(
      `d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`,
    );

    expect(await http.download({ url: `${baseUrl}/test.txt` })).toBe(expected);
    // uses cache
    expect(await http.download({ url: `${baseUrl}/test.txt` })).toBe(expected);
  });

  test('download with checksum', async () => {
    scope(baseUrl).get('/test.txt').reply(200, 'https://example.com/test.txt');

    const expectedChecksum =
      'd1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020';
    const expected = cachePath(
      `d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`,
    );

    expect(
      await http.download({
        url: `${baseUrl}/test.txt`,
        expectedChecksum,
        checksumType: 'sha256',
      }),
    ).toBe(expected);
    // uses cache
    expect(
      await http.download({
        url: `${baseUrl}/test.txt`,
        expectedChecksum,
        checksumType: 'sha256',
      }),
    ).toBe(expected);
  });

  test('exists', async () => {
    scope(baseUrl)
      .head('/test.txt')
      .reply(200)
      .head('/test.txt')
      .reply(404)
      .head('/test.txt')
      .reply(501);

    expect(await http.exists(`${baseUrl}/test.txt`)).toBe(true);
    expect(await http.exists(`${baseUrl}/test.txt`)).toBe(false);
    await expect(http.exists(`${baseUrl}/test.txt`)).rejects.toThrow();
  });

  test(
    'get',
    async () => {
      scope(baseUrl, { reqheaders: { 'x-test': 'test' } })
        .get('/test.txt')
        .reply(200, 'test')
        .get('/test.txt')
        .once()
        .reply(501);

      expect(
        await http.get(`${baseUrl}/test.txt`, {
          headers: { 'x-test': 'test' },
        }),
      ).toBe('test');
      await expect(
        http.get(`${baseUrl}/test.txt`, { headers: { 'x-test': 'test' } }),
      ).rejects.toThrow(HTTPError);
    },
    10 * 1000,
  );

  test.each([403, 404, 429, 501, 503])(
    'get: does not repeat a %i',
    async (status) => {
      // without got retries, a repeat would find no interceptor
      scope(baseUrl).get('/test.txt').once().reply(status);

      const err = await http
        .get(`${baseUrl}/test.txt`, { retry: { limit: 0 } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.statusCode).toBe(status);
    },
  );

  test('getJson', async () => {
    scope(baseUrl, { reqheaders: { 'x-test': 'test' } })
      .get('/test.json')
      .reply(200, { test: true })
      .get('/test.json')
      .once()
      .reply(501);

    expect(
      await http.getJson(`${baseUrl}/test.json`, {
        headers: { 'x-test': 'test' },
      }),
    ).toEqual({ test: true });
    await expect(
      http.getJson(`${baseUrl}/test.json`, { headers: { 'x-test': 'test' } }),
    ).rejects.toThrow(HTTPError);
  });

  test.each([403, 404, 429, 501, 503])(
    'getJson: does not repeat a %i',
    async (status) => {
      // without got retries, a repeat would find no interceptor
      scope(baseUrl).get('/test.json').once().reply(status);

      const err = await http
        .getJson(`${baseUrl}/test.json`, { retry: { limit: 0 } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.statusCode).toBe(status);
    },
  );

  test.each([1, 0, -1])(
    'getJson: tries only once, without got retries, for %i attempts',
    async (attempts) => {
      // got retries a 503 by default, a retry would find no interceptor and
      // fail the test
      scope(baseUrl).get('/test.json').once().reply(503);

      const err = await http
        .getJson(`${baseUrl}/test.json`, {}, { attempts })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HTTPError);
    },
  );

  test('getJson: passes the lookup timeouts through to got', async () => {
    const spy = vi.spyOn(got, 'get');
    scope(baseUrl).get('/timeout.json').reply(200, { ok: true });

    await expect(
      http.getJson(`${baseUrl}/timeout.json`, { timeout: lookupTimeout }),
    ).resolves.toEqual({ ok: true });

    expect(spy).toHaveBeenCalledExactlyOnceWith(
      `${baseUrl}/timeout.json`,
      expect.objectContaining({ timeout: lookupTimeout }),
    );
  });

  describe('lookups', () => {
    /** The lookup options with other timeouts, short ones for the tests. */
    function withTimeout(
      timeout: Record<string, number>,
    ): OptionsOfJSONResponseBody {
      return merge<OptionsOfJSONResponseBody>(lookupOptions, { timeout });
    }

    /** Runs the request and returns its error, fails without one. */
    async function failure(request: Promise<unknown>): Promise<Error> {
      const err = await request.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      return err as Error;
    }

    let server: Server | undefined;
    const sockets = new Set<Socket>();

    /**
     * Starts a local server which accepts connections and never answers.
     * @returns its base url
     */
    async function silentServer(): Promise<string> {
      server = createServer((socket) => {
        // never answers
        sockets.add(socket);
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      allowNetConnect('127.0.0.1');
      const { port } = server.address() as AddressInfo;
      return `http://127.0.0.1:${port}`;
    }

    afterEach(async () => {
      if (server) {
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        server.close();
        await once(server, 'close');
        server = undefined;
      }
    });

    test('the presets', () => {
      expect(lookupOptions.retry).toEqual({
        limit: 2,
        errorCodes: [],
        maxRetryAfter: 30_000,
      });
      expect(lookupTimeout).not.toHaveProperty('request');
      expect(toolVersionsTimeout).toEqual({
        ...lookupTimeout,
        request: 30_000,
      });
    });

    test('times out waiting for the response', async () => {
      const url = await silentServer();

      const err = await failure(
        http.getJson(`${url}/silent.json`, withTimeout({ response: 20 }), {
          attempts: 1,
          quiet: true,
        }),
      );

      expect(err.cause).toMatchObject({
        code: 'ETIMEDOUT',
        message: "Timeout awaiting 'response' for 20ms",
      });
    });

    test('times out on an idle socket', async () => {
      const url = await silentServer();

      const err = await failure(
        http.getJson(`${url}/idle.json`, withTimeout({ socket: 20 }), {
          attempts: 1,
          quiet: true,
        }),
      );

      expect(err.cause).toMatchObject({
        code: 'ETIMEDOUT',
        message: "Timeout awaiting 'socket' for 20ms",
      });
    });

    test('times out resolving the host', async () => {
      allowNetConnect('unresolvable.test');

      const err = await failure(
        http.getJson(
          'http://unresolvable.test/version.json',
          {
            ...withTimeout({ lookup: 20 }),
            // a resolver which never answers
            dnsLookup: () => undefined,
          },
          { attempts: 1, quiet: true },
        ),
      );

      expect(err.cause).toMatchObject({
        code: 'ETIMEDOUT',
        message: "Timeout awaiting 'lookup' for 20ms",
      });
    });

    test('does not retry a timeout with got', async () => {
      // a got retry would find no interceptor and fail the test
      scope(baseUrl).get('/stalled.json').times(3).delay(500).reply(200);
      const spy = vi.spyOn(got, 'get');

      const err = await failure(
        http.getJson(`${baseUrl}/stalled.json`, withTimeout({ request: 20 })),
      );

      expect(err.message).toBe('download failed');
      expect(err.cause).toMatchObject({ code: 'ETIMEDOUT' });
      expect(spy).toHaveBeenCalledTimes(3);
    });

    test('retries a 503 with got', async () => {
      scope(baseUrl)
        .get('/busy.json')
        .reply(503)
        .get('/busy.json')
        .reply(200, { ok: true });
      const spy = vi.spyOn(got, 'get');

      await expect(
        http.getJson(
          `${baseUrl}/busy.json`,
          merge<OptionsOfJSONResponseBody>(lookupOptions, {
            retry: { backoffLimit: 10, noise: 0 },
          }),
        ),
      ).resolves.toEqual({ ok: true });

      // got retried, not the http service
      expect(spy).toHaveBeenCalledOnce();
    });

    test('waits for the Retry-After of a 429', async () => {
      scope(baseUrl)
        .get('/limited.json')
        .reply(429, '', { 'retry-after': '1' })
        .get('/limited.json')
        .reply(200, { ok: true });
      const spy = vi.spyOn(got, 'get');
      const start = Date.now();

      await expect(
        http.getJson(`${baseUrl}/limited.json`, lookupOptions),
      ).resolves.toEqual({ ok: true });

      expect(Date.now() - start).toBeGreaterThanOrEqual(900);
      expect(spy).toHaveBeenCalledOnce();
    });

    test('gives up on a Retry-After above 30 s', async () => {
      // neither got nor the http service may try again
      scope(baseUrl)
        .get('/later.json')
        .once()
        .reply(429, '', { 'retry-after': '60' });
      const spy = vi.spyOn(got, 'get');

      const err = await failure(
        http.getJson(`${baseUrl}/later.json`, lookupOptions),
      );

      expect(err).toBeInstanceOf(HTTPError);
      expect((err as HTTPError).response.statusCode).toBe(429);
      expect(spy).toHaveBeenCalledOnce();
    });

    test('the tool-versions timeouts cap the whole request', async () => {
      scope(baseUrl).get('/slow.json').once().delay(500).reply(200);

      const err = await failure(
        http.getJson(
          `${baseUrl}/slow.json`,
          { timeout: { ...toolVersionsTimeout, request: 20 } },
          { attempts: 1, quiet: true },
        ),
      );

      expect(err.cause).toMatchObject({
        code: 'ETIMEDOUT',
        message: "Timeout awaiting 'request' for 20ms",
      });
    });
  });

  test('getJson: retries a network error and keeps the cause', async () => {
    scope(baseUrl)
      .get('/test.json')
      .times(3)
      .replyWithError('connection reset');

    const err = await http
      .getJson(`${baseUrl}/test.json`, { retry: { limit: 0 } })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('download failed');
    expect((err as Error).cause).not.toBeInstanceOf(HTTPError);
    // waits 1 s and 2 s between the attempts
    expect(vi.mocked(sleep).mock.calls).toEqual([[1_000], [2_000]]);
    expect(retryDelay).toBe(1_000);
  });

  test('getJson: bridges a short network outage', async () => {
    scope(baseUrl)
      .get('/blip.json')
      .replyWithError('connection reset')
      .get('/blip.json')
      .reply(200, { ok: true });

    await expect(http.getJson(`${baseUrl}/blip.json`)).resolves.toEqual({
      ok: true,
    });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000);
  });

  test('getJson: does not try an invalid body again', async () => {
    // a repeat would find no interceptor
    scope(baseUrl).get('/invalid.json').once().reply(200, 'not json');

    await expect(http.getJson(`${baseUrl}/invalid.json`)).rejects.toThrow(
      ParseError,
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  test('getJson: does not wait before giving up on a status', async () => {
    scope(baseUrl).get('/gone.json').once().reply(410);

    await expect(http.getJson(`${baseUrl}/gone.json`)).rejects.toThrow(
      HTTPError,
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  test('getJsonOrUndefined', async () => {
    scope(baseUrl)
      .get('/test.json')
      .reply(200, { test: true })
      .get('/missing.json')
      .reply(404)
      .get('/fail.json')
      .once()
      .reply(501);

    expect(await http.getJsonOrUndefined(`${baseUrl}/test.json`)).toEqual({
      test: true,
    });
    // a 404 is answered once, without retries
    expect(await http.getJsonOrUndefined(`${baseUrl}/missing.json`)).toBe(
      undefined,
    );
    await expect(
      http.getJsonOrUndefined(`${baseUrl}/fail.json`),
    ).rejects.toThrow(HTTPError);
  });

  test('replaces url', async () => {
    scope('https://example.org')
      .get('/replace.txt')
      .reply(200, 'ok')
      .head('/replace.txt')
      .reply(200);

    vi.stubEnv('URL_REPLACE_0_FROM', baseUrl);
    vi.stubEnv('URL_REPLACE_0_TO', 'https://example.test');

    vi.stubEnv('URL_REPLACE_11_FROM', 'https://example.test');
    vi.stubEnv('URL_REPLACE_11_TO', 'https://example.corp');

    vi.stubEnv('URL_REPLACE_10_FROM', 'https://example.test');
    vi.stubEnv('URL_REPLACE_10_TO', 'https://example.org');

    // coverage
    vi.stubEnv('URL_REPLACE_1_FROM', 'https://example.test');

    const expected = cachePath(
      `f4eba41457a330d0fa5289e49836326c6a0208bbc639862e70bb378c88c62642/replace.txt`,
    );

    expect(await http.download({ url: `${baseUrl}/replace.txt` })).toBe(
      expected,
    );
    // uses cache
    expect(await http.download({ url: `${baseUrl}/replace.txt` })).toBe(
      expected,
    );

    expect(await http.exists(`${baseUrl}/replace.txt`)).toBe(true);

    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid URL replacement: URL_REPLACE_1_FROM=https://example.test URL_REPLACE_1_TO=undefined',
    );
  });
});
