import { mkdir, writeFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { logger } from '../utils/index.ts';
import { ToolVersionsService, createContainer } from './index.ts';
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

  test('has no versions for a missing file', async () => {
    expect(await svc.getVersions('missing')).toBeUndefined();
  });

  test('has no versions for an unparsable file', async () => {
    await writeFile(`${dir}/broken.json`, '{ not json');

    expect(await svc.getVersions('broken')).toBeUndefined();
  });
});
