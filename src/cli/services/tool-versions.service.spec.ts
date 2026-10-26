import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { logger } from '../utils/index.ts';
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

  describe('getOnlineVersions', () => {
    const baseUrl = 'https://containerbase.github.io';

    test('fetches the published file once per instance', async () => {
      const online = data('online');
      scope(baseUrl).get('/tool-versions/v1/online.json').reply(200, online);

      expect(await svc.getOnlineVersions('online')).toEqual(online);
      // cached, a second request would fail without an interceptor
      expect(await svc.getOnlineVersions('online')).toEqual(online);
    });

    test('uses a timeout and no retries', async () => {
      const spy = vi.spyOn(HttpService.prototype, 'getJson');
      scope(baseUrl)
        .get('/tool-versions/v1/opts.json')
        .reply(200, data('opts'));

      await svc.getOnlineVersions('opts');

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

      expect(await svc.getOnlineVersions('down')).toBeUndefined();
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('has no versions for an unreachable file', async () => {
      scope(baseUrl).get('/tool-versions/v1/gone.json').reply(404);

      expect(await svc.getOnlineVersions('gone')).toBeUndefined();
      expect(logger.error).not.toHaveBeenCalled();
    });

    test('has no versions for a file of another tool', async () => {
      scope(baseUrl)
        .get('/tool-versions/v1/mixed.json')
        .reply(200, data('other'));

      expect(await svc.getOnlineVersions('mixed')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'mixed', dataTool: 'other' }),
        'online tool-versions data of another tool',
      );
    });

    test('has no versions for an invalid file', async () => {
      scope(baseUrl)
        .get('/tool-versions/v1/bad.json')
        .reply(200, { ...data('bad'), versions: undefined });

      expect(await svc.getOnlineVersions('bad')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'bad',
          location: 'https://containerbase.github.io/tool-versions/v1/bad.json',
        }),
        'invalid online tool-versions data',
      );
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
