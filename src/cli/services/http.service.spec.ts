import { HTTPError } from 'got';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
import { HttpService } from './index.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
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
        .times(3)
        .reply(501);

      expect(
        await http.get(`${baseUrl}/test.txt`, {
          headers: { 'x-test': 'test' },
        }),
      ).toBe('test');
      await expect(
        http.get(`${baseUrl}/test.txt`, { headers: { 'x-test': 'test' } }),
      ).rejects.toThrow('download failed');
    },
    10 * 1000,
  );

  test.each([403, 404])('get: does not retry a %i', async (status) => {
    scope(baseUrl).get('/test.txt').once().reply(status);

    const err = await http.get(`${baseUrl}/test.txt`).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HTTPError);
    expect((err as HTTPError).response.statusCode).toBe(status);
  });

  test.each([429, 501])(
    'get: retries a %i and keeps the cause',
    async (status) => {
      scope(baseUrl).get('/test.txt').times(3).reply(status);

      const err = await http
        .get(`${baseUrl}/test.txt`, { retry: { limit: 0 } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('download failed');
      expect((err as Error).cause).toBeInstanceOf(HTTPError);
    },
    10 * 1000,
  );

  test('getJson', async () => {
    scope(baseUrl, { reqheaders: { 'x-test': 'test' } })
      .get('/test.json')
      .reply(200, { test: true })
      .get('/test.json')
      .times(3)
      .reply(501);

    expect(
      await http.getJson(`${baseUrl}/test.json`, {
        headers: { 'x-test': 'test' },
      }),
    ).toEqual({ test: true });
    await expect(
      http.getJson(`${baseUrl}/test.json`, { headers: { 'x-test': 'test' } }),
    ).rejects.toThrow('download failed');
  });

  test.each([403, 404])('getJson: does not retry a %i', async (status) => {
    scope(baseUrl).get('/test.json').once().reply(status);

    const err = await http
      .getJson(`${baseUrl}/test.json`)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HTTPError);
    expect((err as HTTPError).response.statusCode).toBe(status);
  });

  test.each([429, 501])(
    'getJson: retries a %i and keeps the cause',
    async (status) => {
      scope(baseUrl).get('/test.json').times(3).reply(status);

      const err = await http
        .getJson(`${baseUrl}/test.json`, { retry: { limit: 0 } })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toBe('download failed');
      expect((err as Error).cause).toBeInstanceOf(HTTPError);
    },
    10 * 1000,
  );

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
  });

  test('getJsonOrUndefined', async () => {
    scope(baseUrl)
      .get('/test.json')
      .reply(200, { test: true })
      .get('/missing.json')
      .reply(404)
      .get('/fail.json')
      .times(3)
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
    ).rejects.toThrow('download failed');
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
