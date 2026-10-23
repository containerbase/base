import { injectFromHierarchy, injectable } from 'inversify';
import { describe, expect, test, vi } from 'vitest';
import {
  HttpService,
  lookupOptions,
  lookupTimeout,
} from '../services/index.ts';
import { ToolVersionResolver, newestVersion } from './tool-version-resolver.ts';
import { scope } from '~test/http-mock.ts';
import { toolContext } from '~test/tool.ts';

const baseUrl = 'https://example.test';

@injectable()
@injectFromHierarchy()
class LookupVersionResolver extends ToolVersionResolver {
  readonly tool = 'lookup';

  /**
   * Resolves `json` from a json lookup, `slow` from a text lookup with a
   * longer request timeout, else from a text lookup.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (version === 'slow') {
      return await this.get(`${baseUrl}/version`, {
        timeout: { request: 60_000 },
      });
    }
    if (version === 'json') {
      const data = await this.getJson(`${baseUrl}/version.json`, {
        headers: { accept: 'application/json' },
      });
      return String(data);
    }
    return await this.get(`${baseUrl}/version`);
  }
}

describe('cli/install-tool/tool-version-resolver', () => {
  describe('ToolVersionResolver', () => {
    test('get looks up with the lookup options', async () => {
      const spy = vi.spyOn(HttpService.prototype, 'get');
      scope(baseUrl).get('/version').reply(200, '1.0.0');
      const { svc } = await toolContext(LookupVersionResolver);

      expect(await svc.resolve(undefined)).toBe('1.0.0');
      expect(spy).toHaveBeenCalledExactlyOnceWith(
        `${baseUrl}/version`,
        lookupOptions,
      );
    });

    test('getJson looks up with the lookup options and the given ones', async () => {
      const spy = vi.spyOn(HttpService.prototype, 'getJson');
      scope(baseUrl).get('/version.json').reply(200, '"2.0.0"');
      const { svc } = await toolContext(LookupVersionResolver);

      expect(await svc.resolve('json')).toBe('2.0.0');
      expect(spy).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/version.json`, {
        ...lookupOptions,
        headers: { accept: 'application/json' },
      });
    });

    test('a partial override keeps the other lookup options', async () => {
      const spy = vi.spyOn(HttpService.prototype, 'get');
      scope(baseUrl).get('/version').reply(200, '3.0.0');
      const { svc } = await toolContext(LookupVersionResolver);

      expect(await svc.resolve('slow')).toBe('3.0.0');
      expect(spy).toHaveBeenCalledExactlyOnceWith(`${baseUrl}/version`, {
        ...lookupOptions,
        timeout: { ...lookupTimeout, request: 60_000 },
      });
    });
  });

  describe('newestVersion', () => {
    test('returns undefined without versions', () => {
      expect(newestVersion([])).toBeUndefined();
    });

    test.each([
      { versions: ['6.1.7', '6.1.7.9', '6.1.7.10'], expected: '6.1.7.10' },
      { versions: ['6.1.7.10', '6.1.7.9', '6.1.7'], expected: '6.1.7.10' },
      { versions: ['6.1.7.9', '6.1.7.10', '6.1.7'], expected: '6.1.7.10' },
      { versions: ['2.9.1', '2.10.0', '2.5.11'], expected: '2.10.0' },
      { versions: ['4.8', '4.9', '4.8.1'], expected: '4.9' },
      { versions: ['1.0.0.pre2', '1.0.0.pre10'], expected: '1.0.0.pre10' },
    ])('picks $expected from $versions', ({ versions, expected }) => {
      expect(newestVersion(versions)).toBe(expected);
    });

    test('treats a missing segment as 0 and keeps the first of equal versions', () => {
      expect(newestVersion(['6.1', '6.1.0'])).toBe('6.1');
      expect(newestVersion(['6.1.0', '6.1'])).toBe('6.1.0');
    });
  });
});
