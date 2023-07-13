import { env } from 'node:process';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test } from 'vitest';
import { HttpService, rootContainer } from '.';
import { scope } from '~test/http-mock';

describe('http.service', () => {
  let child!: Container;

  beforeEach(() => {
    child = rootContainer.createChild();

    for (const key of Object.keys(env)) {
      if (key.startsWith('URL_REPLACE_')) {
        delete env[key];
      }
    }
  });

  test('throws', async () => {
    scope('https://example.com').get('/fail.txt').times(6).reply(404);
    const http = child.get(HttpService);

    await expect(
      http.download({ url: 'https://example.com/fail.txt' })
    ).rejects.toThrow();
    await expect(
      http.download({ url: 'https://example.com/fail.txt' })
    ).rejects.toThrow();
  });

  test('download', async () => {
    scope('https://example.com').get('/test.txt').reply(200, 'ok');

    const http = child.get(HttpService);

    expect(await http.download({ url: 'https://example.com/test.txt' })).toBe(
      `${env.CONTAINERBASE_CACHE_DIR}/d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`
    );
    // uses cache
    expect(await http.download({ url: 'https://example.com/test.txt' })).toBe(
      `${env.CONTAINERBASE_CACHE_DIR}/d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`
    );
  });

  test('replaces url', async () => {
    scope('https://example.org').get('/test.txt').reply(200, 'ok');

    env.URL_REPLACE_0_FROM = 'https://example.com';
    env.URL_REPLACE_0_TO = 'https://example.org';

    const http = child.get(HttpService);

    expect(await http.download({ url: 'https://example.org/test.txt' })).toBe(
      `${env.CONTAINERBASE_CACHE_DIR}/d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`
    );
    // uses cache
    expect(await http.download({ url: 'https://example.org/test.txt' })).toBe(
      `${env.CONTAINERBASE_CACHE_DIR}/d1dc63218c42abba594fff6450457dc8c4bfdd7c22acf835a50ca0e5d2693020/test.txt`
    );
  });
});
