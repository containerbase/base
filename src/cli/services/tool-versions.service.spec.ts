import { mkdir, writeFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { HttpService, ToolVersionsService, createContainer } from './index.ts';
import { onlineToolVersionsTimeout } from './tool-versions.service.ts';
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

  test('reads a file once per process', async () => {
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
                checksum: 'sha256:abc',
              },
            ],
          },
        ],
      },
    },
  ])('has no versions for a file with $name', async ({ tool, file }) => {
    await writeFile(`${dir}/${tool}.json`, JSON.stringify(file));

    expect(await svc.getVersions(tool)).toBeUndefined();
  });

  describe('getOnlineVersions', () => {
    const baseUrl = 'https://containerbase.github.io';

    test('fetches the published file once per process', async () => {
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
        {
          timeout: { request: onlineToolVersionsTimeout },
          retry: { limit: 0 },
        },
        1,
      );
      expect(onlineToolVersionsTimeout).toBe(30_000);
    });

    test('has no versions after a network error, without a retry', async () => {
      // a retry would find no interceptor and fail the test
      scope(baseUrl)
        .get('/tool-versions/v1/down.json')
        .once()
        .replyWithError('connection reset');

      expect(await svc.getOnlineVersions('down')).toBeUndefined();
    });

    test('has no versions for an unreachable file', async () => {
      scope(baseUrl).get('/tool-versions/v1/gone.json').reply(404);

      expect(await svc.getOnlineVersions('gone')).toBeUndefined();
    });

    test('has no versions for an invalid file', async () => {
      scope(baseUrl)
        .get('/tool-versions/v1/bad.json')
        .reply(200, { ...data('bad'), versions: undefined });

      expect(await svc.getOnlineVersions('bad')).toBeUndefined();
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
