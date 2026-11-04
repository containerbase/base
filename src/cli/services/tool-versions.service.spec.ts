import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { logger, resetWarnings } from '../utils/index.ts';
import {
  HttpService,
  ToolVersionsService,
  createContainer,
  toolVersionsTimeout,
} from './index.ts';
import { scope } from '~test/http-mock.ts';
import { rootPath } from '~test/path.ts';

/**
 * A valid `<tool>.json` file.
 * @param tool - the tool name
 * @param versions - the versions to list
 */
function data(
  tool: string,
  versions: { version: string }[] = [{ version: '1.0.0' }],
): Record<string, unknown> {
  return {
    tool,
    updatedAt: '2026-10-16T00:00:00Z',
    versions,
  };
}

/**
 * A valid `<tool>/<version>.json` file.
 * @param tool - the tool name
 * @param version - the version
 */
function files(tool: string, version: string): Record<string, unknown> {
  return {
    tool,
    version,
    files: [
      {
        name: `${tool}-${version}.tar.xz`,
        url: `https://example.com/${tool}-${version}.tar.xz`,
        checksum: `sha512:${'a'.repeat(128)}`,
        arch: 'amd64',
        distro: 'jammy',
      },
    ],
  };
}

/** The SRI sha256 integrity of a published file. */
function integrity(content: string): string {
  return `sha256-${createHash('sha256').update(content).digest('base64')}`;
}

describe('cli/services/tool-versions.service', () => {
  let svc!: ToolVersionsService;
  let dir!: string;

  beforeAll(async () => {
    // the root dir is only set by the test setup
    dir = rootPath('usr/local/containerbase/tool-versions/v1');
    await mkdir(dir, { recursive: true });
  });

  beforeEach(async () => {
    svc = await createContainer().getAsync(ToolVersionsService);
  });

  test('reads the versions of a tool', async () => {
    const read = data('read', [{ version: '2.0.0' }, { version: '1.0.0' }]);
    await writeFile(`${dir}/read.json`, JSON.stringify(read));

    expect(await svc.getVersions('read')).toEqual(read);
  });

  test('accepts unknown keys and archs, and ignores the source', async () => {
    const future = {
      ...data('future'),
      source: { datasource: 'new', packageName: 'x', versioning: 'new' },
      added: true,
      versions: [
        {
          version: '1.0.0',
          files: [
            {
              name: 'f.tar.gz',
              url: 'https://example.com/f.tar.gz',
              checksum: `sha256:${'a'.repeat(64)}`,
              arch: 'riscv64',
            },
          ],
        },
      ],
    };
    await writeFile(`${dir}/future.json`, JSON.stringify(future));

    const versions = await svc.getVersions('future');

    expect(versions).not.toHaveProperty('source');
    expect(versions?.versions[0]?.files?.[0]?.arch).toBe('riscv64');
    expect(versions).not.toHaveProperty('added');
  });

  test('has no versions for a file of another tool', async () => {
    await writeFile(`${dir}/renamed.json`, JSON.stringify(data('other')));

    expect(await svc.getVersions('renamed')).toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'renamed',
        location: `${dir}/renamed.json`,
        dataTool: 'other',
      }),
      'embedded tool-versions data of another tool',
    );
  });

  test('reads a file once per instance', async () => {
    await writeFile(`${dir}/cached.json`, JSON.stringify(data('cached')));
    const first = await svc.getVersions('cached');
    await writeFile(`${dir}/cached.json`, JSON.stringify(data('cached', [])));

    expect(await svc.getVersions('cached')).toBe(first);
  });

  test.each([
    {
      name: 'a missing versions list',
      tool: 'invalid1',
      file: { ...data('invalid1'), versions: undefined },
    },
    {
      name: 'a bad checksum',
      tool: 'invalid2',
      file: {
        ...data('invalid2'),
        versions: [
          {
            version: '1.0.0',
            files: [
              {
                name: 'f.tar.gz',
                url: 'https://example.com/f.tar.gz',
                checksum: 'SHA256:ABC',
              },
            ],
          },
        ],
      },
    },
  ])('has no versions for a file with $name', async ({ tool, file }) => {
    await writeFile(`${dir}/${tool}.json`, JSON.stringify(file));

    expect(await svc.getVersions(tool)).toBeUndefined();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ tool, location: `${dir}/${tool}.json` }),
      'invalid embedded tool-versions data',
    );
  });

  describe('the online data', () => {
    // a tool without embedded data is resolved from the online data
    const baseUrl = 'https://containerbase.github.io';

    test('fetches the published file once per instance', async () => {
      const online = data('online');
      scope(baseUrl).get('/tool-versions/v1/online.json').reply(200, online);

      expect(await svc.getResolveVersions('online')).toEqual({
        data: online,
        source: 'online',
      });
      // cached, a second request would fail without an interceptor
      expect(await svc.getResolveVersions('online')).toEqual({
        data: online,
        source: 'online',
      });
    });

    test('uses a timeout and no retries', async () => {
      const spy = vi.spyOn(HttpService.prototype, 'getJson');
      scope(baseUrl)
        .get('/tool-versions/v1/opts.json')
        .reply(200, data('opts'));

      await svc.getResolveVersions('opts');

      expect(spy).toHaveBeenCalledExactlyOnceWith(
        'https://containerbase.github.io/tool-versions/v1/opts.json',
        { timeout: toolVersionsTimeout },
        { attempts: 1, quiet: true },
      );
    });

    test('has no versions after a network error, without a retry', async () => {
      // a retry would find no interceptor and fail the test
      scope(baseUrl)
        .get('/tool-versions/v1/down.json')
        .once()
        .replyWithError('connection reset');

      expect(await svc.getResolveVersions('down')).toBeUndefined();
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('has no versions for an unreachable file', async () => {
      scope(baseUrl).get('/tool-versions/v1/gone.json').reply(404);

      expect(await svc.getResolveVersions('gone')).toBeUndefined();
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('has no versions for a file of another tool', async () => {
      scope(baseUrl)
        .get('/tool-versions/v1/mixed.json')
        .reply(200, data('other'));

      expect(await svc.getResolveVersions('mixed')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'mixed', dataTool: 'other' }),
        'online tool-versions data of another tool',
      );
    });

    test('has no versions for an invalid file', async () => {
      scope(baseUrl)
        .get('/tool-versions/v1/bad.json')
        .reply(200, { ...data('bad'), versions: undefined });

      expect(await svc.getResolveVersions('bad')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'bad',
          location: 'https://containerbase.github.io/tool-versions/v1/bad.json',
        }),
        'invalid online tool-versions data',
      );
    });
  });

  describe('the age of the embedded data', () => {
    const baseUrl = 'https://containerbase.github.io';
    /** The embedded `release.json`. */
    let release!: string;

    /**
     * Writes the embedded `release.json`.
     * @param age - how long ago the data was built, in milliseconds
     */
    async function built(age: number): Promise<void> {
      await writeFile(
        release,
        JSON.stringify({
          version: '1.8.0',
          buildTime: new Date(Date.now() - age).toISOString(),
        }),
      );
    }

    /** The embedded data of the tool `age`. */
    const embedded = data('age');

    /**
     * Resolves the tool `age`, the source is `embedded` while the embedded
     * data is current, else `fallback`, as the online data is not available.
     * @param current - whether the embedded data is expected to be current,
     * else the online lookup is mocked
     */
    async function resolveAge(current: boolean): Promise<string | undefined> {
      if (!current) {
        scope(baseUrl).get('/tool-versions/v1/age.json').reply(404);
      }
      // without an interceptor a request would fail the test
      return (await svc.getResolveVersions('age'))?.source;
    }

    beforeEach(async () => {
      release = rootPath('usr/local/containerbase/tool-versions/release.json');
      await rm(release, { force: true });
      await writeFile(`${dir}/age.json`, JSON.stringify(embedded));
    });

    afterAll(async () => {
      // the later tests run without an embedded release
      await rm(release, { force: true });
    });

    test('is not current without an embedded release', async () => {
      expect(await resolveAge(false)).toBe('fallback');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ file: release }),
        'no embedded tool-versions release',
      );
    });

    test('is not current with an invalid embedded release', async () => {
      await writeFile(release, JSON.stringify({ version: '1.8.0' }));

      expect(await resolveAge(false)).toBe('fallback');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ file: release }),
        'invalid embedded tool-versions release',
      );
    });

    test('is current within the max age', async () => {
      await built(60_000);

      expect(await resolveAge(true)).toBe('embedded');
    });

    test('checks the age once per instance', async () => {
      await built(60_000);

      expect(await resolveAge(true)).toBe('embedded');
      expect(await resolveAge(true)).toBe('embedded');
      expect(logger.debug).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ release: '1.8.0', current: true }),
        'embedded tool-versions data age',
      );
    });

    test('is not current when the embedded data was built in the future', async () => {
      await built(-3_600_000);

      expect(await resolveAge(false)).toBe('fallback');
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ release: '1.8.0' }),
        'embedded tool-versions data built in the future, using the online data',
      );
    });

    test('is not current when the embedded data is older than 24 hours', async () => {
      await built(25 * 3_600_000);

      expect(await resolveAge(false)).toBe('fallback');
    });

    test('uses the max age of CONTAINERBASE_RESOLVER_MAX_AGE', async () => {
      vi.stubEnv('CONTAINERBASE_RESOLVER_MAX_AGE', '1 week');
      await built(25 * 3_600_000);

      expect(await resolveAge(true)).toBe('embedded');
    });

    test.each([
      // current data isn't outdated, also with the online data turned off
      { age: 60_000, source: 'embedded' },
      { age: 25 * 3_600_000, source: 'offline' },
    ])(
      'tells $source data built $age ms ago when the online data is turned off',
      async ({ age, source }) => {
        vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');
        await built(age);

        // no interceptor, a request would fail the test
        expect(await resolveAge(true)).toBe(source);
      },
    );
  });

  describe('getResolveVersions', () => {
    const baseUrl = 'https://containerbase.github.io';

    test('prefers the online data', async () => {
      await writeFile(`${dir}/resolve1.json`, JSON.stringify(data('resolve1')));
      const online = data('resolve1', [{ version: '2.0.0' }]);
      scope(baseUrl).get('/tool-versions/v1/resolve1.json').reply(200, online);

      expect(await svc.getResolveVersions('resolve1')).toEqual({
        data: online,
        source: 'online',
      });
    });

    test('uses the embedded data when the online data is turned off', async () => {
      vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');
      const embedded = data('resolve2');
      await writeFile(`${dir}/resolve2.json`, JSON.stringify(embedded));

      // no interceptor, a request would fail the test
      expect(await svc.getResolveVersions('resolve2')).toEqual({
        data: embedded,
        source: 'offline',
      });
    });

    test('uses the embedded data while it is current', async () => {
      const release = rootPath(
        'usr/local/containerbase/tool-versions/release.json',
      );
      await writeFile(
        release,
        JSON.stringify({
          version: '1.8.0',
          buildTime: new Date(Date.now() - 60_000).toISOString(),
        }),
      );
      const embedded = data('resolve7');
      await writeFile(`${dir}/resolve7.json`, JSON.stringify(embedded));

      try {
        // no interceptor, a request would fail the test
        expect(await svc.getResolveVersions('resolve7')).toEqual({
          data: embedded,
          source: 'embedded',
        });

        // a tool which only the online data has is looked up online
        const online = data('resolve8');
        scope(baseUrl)
          .get('/tool-versions/v1/resolve8.json')
          .reply(200, online);
        expect(await svc.getResolveVersions('resolve8')).toEqual({
          data: online,
          source: 'online',
        });
      } finally {
        await rm(release, { force: true });
      }
    });

    test('has nothing for a tool without embedded data when the online data is turned off', async () => {
      vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');

      // no interceptor, a request would fail the test
      expect(await svc.getResolveVersions('resolve9')).toBeUndefined();
    });

    test('falls back to the embedded data when the online data is not available', async () => {
      const embedded = data('resolve3');
      await writeFile(`${dir}/resolve3.json`, JSON.stringify(embedded));
      scope(baseUrl).get('/tool-versions/v1/resolve3.json').reply(404);

      expect(await svc.getResolveVersions('resolve3')).toEqual({
        data: embedded,
        source: 'fallback',
      });
    });

    test('has nothing for a tool without data', async () => {
      scope(baseUrl).get('/tool-versions/v1/resolve4.json').reply(404);

      expect(await svc.getResolveVersions('resolve4')).toBeUndefined();
    });
  });

  describe('turned off online data', () => {
    beforeEach(() => {
      vi.stubEnv('CONTAINERBASE_RESOLVER_OFFLINE', 'true');
      // the warnings are logged once per process
      resetWarnings();
    });

    test('fetches no versions and warns once about offline mode', async () => {
      // no interceptor, a request would fail the test
      expect(await svc.getResolveVersions('off')).toBeUndefined();
      expect(await svc.getResolveVersions('off')).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        { tool: 'off' },
        'No embedded tool-versions data, CONTAINERBASE_RESOLVER_OFFLINE turns the online data off',
      );
    });

    test('fetches no version files, but reads the embedded ones', async () => {
      const embedded = files('offemb', '1.0.0');
      await mkdir(`${dir}/offemb`, { recursive: true });
      await writeFile(`${dir}/offemb/1.0.0.json`, JSON.stringify(embedded));

      expect(await svc.getVersionFiles('offemb', '1.0.0')).toEqual(embedded);
      // no interceptor, a request would fail the test
      expect(await svc.getVersionFiles('offemb', '2.0.0')).toBeUndefined();
    });
  });

  describe('getVersionFiles', () => {
    const baseUrl = 'https://containerbase.github.io';

    /**
     * Mocks the published files of a version and the integrity file of the
     * tool.
     * @param path - the url path of the version file, below `v1/`
     * @param body - the published version file
     * @param versions - the integrity file entries
     */
    function mockOnline(
      tool: string,
      path: string,
      body: string,
      versions: Record<string, string>,
    ): void {
      scope(baseUrl)
        .get(`/tool-versions/v1/${path}`)
        .reply(200, body)
        .get(`/tool-versions/v1/${tool}.integrity.json`)
        .reply(200, { tool, versions });
    }

    test('keeps the files of a version with an unknown checksum algorithm', async () => {
      const embedded = {
        tool: 'algo',
        version: '1.0.0',
        files: [
          {
            name: 'algo-1.0.0-amd64.tar.xz',
            url: 'https://example.com/algo-1.0.0-amd64.tar.xz',
            checksum: `sha512:${'a'.repeat(128)}`,
            arch: 'amd64',
          },
          {
            name: 'algo-1.0.0-arm64.tar.xz',
            url: 'https://example.com/algo-1.0.0-arm64.tar.xz',
            checksum: `blake3:${'b'.repeat(64)}`,
            arch: 'arm64',
          },
        ],
      };
      await mkdir(`${dir}/algo`, { recursive: true });
      await writeFile(`${dir}/algo/1.0.0.json`, JSON.stringify(embedded));

      expect(await svc.getVersionFiles('algo', '1.0.0')).toEqual(embedded);
    });

    test('reads the embedded files once per instance', async () => {
      const embedded = files('emb', '1.0.0+7');
      await mkdir(`${dir}/emb`, { recursive: true });
      await writeFile(`${dir}/emb/1.0.0+7.json`, JSON.stringify(embedded));

      const first = await svc.getVersionFiles('emb', '1.0.0+7');

      expect(first).toEqual(embedded);
      // cached, a request would fail without an interceptor
      expect(await svc.getVersionFiles('emb', '1.0.0+7')).toBe(first);
    });

    test('fetches the files verified against the integrity', async () => {
      const body = JSON.stringify(files('onl', '2.0.0+8'));
      // the `+` of the version is url encoded
      mockOnline('onl', 'onl/2.0.0%2B8.json', body, {
        '2.0.0+8': integrity(body),
      });
      const spy = vi.spyOn(HttpService.prototype, 'get');

      expect(await svc.getVersionFiles('onl', '2.0.0+8')).toEqual(
        JSON.parse(body),
      );
      expect(spy).toHaveBeenCalledExactlyOnceWith(
        'https://containerbase.github.io/tool-versions/v1/onl/2.0.0%2B8.json',
        { timeout: toolVersionsTimeout },
        { attempts: 1, quiet: true },
      );
    });

    test('reads the integrity once per tool', async () => {
      const first = JSON.stringify(files('twice', '1.0.0'));
      const second = JSON.stringify(files('twice', '2.0.0'));
      mockOnline('twice', 'twice/1.0.0.json', first, {
        '1.0.0': integrity(first),
        '2.0.0': integrity(second),
      });
      scope(baseUrl)
        .get('/tool-versions/v1/twice/2.0.0.json')
        .reply(200, second);

      expect(await svc.getVersionFiles('twice', '1.0.0')).toBeDefined();
      expect(await svc.getVersionFiles('twice', '2.0.0')).toBeDefined();
    });

    test('fetches the files of an embedded file of another version', async () => {
      await mkdir(`${dir}/moved`, { recursive: true });
      await writeFile(
        `${dir}/moved/1.0.0.json`,
        JSON.stringify(files('moved', '1.0.1')),
      );
      scope(baseUrl)
        .get('/tool-versions/v1/moved/1.0.0.json')
        .reply(404)
        .get('/tool-versions/v1/moved.integrity.json')
        .reply(404);

      expect(await svc.getVersionFiles('moved', '1.0.0')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'moved',
          version: '1.0.0',
          dataVersion: '1.0.1',
        }),
        'embedded tool-versions files of another version',
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('has no files on an integrity mismatch', async () => {
      const body = JSON.stringify(files('tampered', '1.0.0'));
      mockOnline('tampered', 'tampered/1.0.0.json', body, {
        '1.0.0': integrity(`${body} `),
      });

      expect(await svc.getVersionFiles('tampered', '1.0.0')).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'tampered', version: '1.0.0' }),
        'online tool-versions files integrity mismatch',
      );
    });

    test('has no files without an integrity entry', async () => {
      const body = JSON.stringify(files('unlisted', '1.0.0'));
      mockOnline('unlisted', 'unlisted/1.0.0.json', body, {});

      expect(await svc.getVersionFiles('unlisted', '1.0.0')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'unlisted', version: '1.0.0' },
        'no online tool-versions integrity',
      );
    });

    test('ignores inherited integrity entries', async () => {
      const body = JSON.stringify(files('proto', 'constructor'));
      mockOnline('proto', 'proto/constructor.json', body, {});

      expect(await svc.getVersionFiles('proto', 'constructor')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'proto', version: 'constructor' },
        'no online tool-versions integrity',
      );
    });

    test('has no files without an integrity file', async () => {
      scope(baseUrl)
        .get('/tool-versions/v1/noint/1.0.0.json')
        .reply(200, JSON.stringify(files('noint', '1.0.0')))
        .get('/tool-versions/v1/noint.integrity.json')
        .reply(404);

      expect(await svc.getVersionFiles('noint', '1.0.0')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'noint', err: expect.any(Error) }),
        'no online tool-versions integrity',
      );
    });

    test('has no files for an invalid integrity file', async () => {
      const body = JSON.stringify(files('badint', '1.0.0'));
      scope(baseUrl)
        .get('/tool-versions/v1/badint/1.0.0.json')
        .reply(200, body)
        .get('/tool-versions/v1/badint.integrity.json')
        .reply(200, { tool: 'badint', versions: { '1.0.0': 'sha1-abc' } });

      expect(await svc.getVersionFiles('badint', '1.0.0')).toBeUndefined();
    });

    test('has no files for an invalid file', async () => {
      const body = JSON.stringify({ ...files('invalid', '1.0.0'), files: [] });
      mockOnline('invalid', 'invalid/1.0.0.json', body, {
        '1.0.0': integrity(body),
      });

      expect(await svc.getVersionFiles('invalid', '1.0.0')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'invalid' }),
        'invalid online tool-versions data',
      );
    });

    test('has no files for a missing file', async () => {
      scope(baseUrl)
        .get('/tool-versions/v1/none/1.0.0.json')
        .reply(404)
        .get('/tool-versions/v1/none.integrity.json')
        .reply(200, { tool: 'none', versions: {} });

      expect(await svc.getVersionFiles('none', '1.0.0')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'none', version: '1.0.0' }),
        'no online tool-versions files',
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('has no files for an unpublished version', async () => {
      // a request would fail without an interceptor
      expect(await svc.getVersionFiles('odd', '../1.0.0')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'odd', version: '../1.0.0' },
        'version without tool-versions files',
      );
    });
  });

  test('has no versions for a missing file', async () => {
    expect(await svc.getVersions('missing')).toBeUndefined();
  });

  test('has no versions for an unparsable file', async () => {
    await writeFile(`${dir}/broken.json`, '{ not json');

    expect(await svc.getVersions('broken')).toBeUndefined();
  });
});
