import fs from 'node:fs/promises';
import { arch } from 'node:os';
import {
  type MockInstance,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import type { ToolFile } from '../../../packages/base/src/tool-versions-types.ts';
import { getDistro, logger } from '../utils/index.ts';
import { ToolFilesService, ToolVersionsService } from './index.ts';
import { selectToolFile } from './tool-files.service.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { checksum, mockToolFiles } from '~test/tool.ts';

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const baseUrl = 'https://example.test';

/**
 * A file of a version for the tests, named `name` and with the checksum of
 * its name as content.
 */
function listedFile(
  name: string,
  props: Pick<ToolFile, 'arch' | 'distro'> = {},
): ToolFile {
  return {
    name,
    url: `${baseUrl}/files/${name}`,
    checksum: `sha256:${checksum(name, 'sha256')}`,
    ...props,
  };
}

describe('cli/services/tool-files.service', () => {
  let svc!: ToolFilesService;

  beforeEach(async () => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    const child = await testContainer();
    svc = await child.getAsync(ToolFilesService);
  });

  describe('downloadToolFile', () => {
    const files = [
      listedFile('dummy-arm64.tar.gz', { arch: 'arm64' }),
      listedFile('dummy-jammy-amd64.tar.gz', {
        arch: 'amd64',
        distro: 'jammy',
      }),
      listedFile('dummy-noble-amd64.tar.gz', {
        arch: 'amd64',
        distro: 'noble',
      }),
    ];

    test('downloads the file of the host distro and arch', async () => {
      const spy = mockToolFiles(files);
      scope(baseUrl)
        .get('/files/dummy-noble-amd64.tar.gz')
        .reply(200, 'dummy-noble-amd64.tar.gz');

      const file = await svc.downloadToolFile('dummy', '1.0.0');

      expect(file).toMatch(/dummy-noble-amd64\.tar\.gz$/);
      expect(await fs.readFile(file!, 'utf8')).toBe('dummy-noble-amd64.tar.gz');
      expect(spy).toHaveBeenCalledWith('dummy', '1.0.0');
    });

    test('downloads the file of the given distro', async () => {
      mockToolFiles(files);
      scope(baseUrl)
        .get('/files/dummy-jammy-amd64.tar.gz')
        .reply(200, 'dummy-jammy-amd64.tar.gz');

      expect(await svc.downloadToolFile('dummy', '1.0.0', 'jammy')).toMatch(
        /dummy-jammy-amd64\.tar\.gz$/,
      );
    });

    test('picks only from the files the filter accepts', async () => {
      mockToolFiles([
        listedFile('dummy-generic.tar.gz'),
        listedFile('dummy-other.tar.gz'),
      ]);
      scope(baseUrl)
        .get('/files/dummy-other.tar.gz')
        .reply(200, 'dummy-other.tar.gz');

      expect(
        await svc.downloadToolFile(
          'dummy',
          '1.0.0',
          undefined,
          (f) => f.name === 'dummy-other.tar.gz',
        ),
      ).toMatch(/dummy-other\.tar\.gz$/);
      expect(
        await svc.downloadToolFile('dummy', '1.0.0', undefined, () => false),
      ).toBeUndefined();
    });

    test('names the file like the data, not like the url', async () => {
      mockToolFiles([
        { ...listedFile('dummy-named.tar.gz'), url: `${baseUrl}/abc` },
      ]);
      scope(baseUrl).get('/abc').reply(200, 'dummy-named.tar.gz');

      expect(await svc.downloadToolFile('dummy', '1.0.0')).toMatch(
        /\/[0-9a-f]+\/dummy-named\.tar\.gz$/,
      );
    });

    test('throws on a checksum mismatch', async () => {
      mockToolFiles([listedFile('dummy-tampered.tar.gz')]);
      scope(baseUrl)
        .get('/files/dummy-tampered.tar.gz')
        .times(3)
        .reply(200, 'tampered');

      await expect(svc.downloadToolFile('dummy', '1.0.0')).rejects.toThrow(
        'download failed',
      );
    });

    test.each([{ checksum: `md5:${'a'.repeat(32)}` }, { checksum: 'sha256' }])(
      'has no file for an unsupported checksum $checksum',
      async ({ checksum }) => {
        // a download would find no interceptor and fail the test
        mockToolFiles([{ ...listedFile('dummy-md5.tar.gz'), checksum }]);

        expect(await svc.downloadToolFile('dummy', '1.0.0')).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(
          { tool: 'dummy', version: '1.0.0', checksum },
          'unsupported tool-versions file checksum',
        );
      },
    );

    test('skips a more specific file with an unsupported checksum', async () => {
      const blake3 = {
        ...listedFile('dummy-blake3-noble-amd64.tar.gz', {
          arch: 'amd64',
          distro: 'noble',
        }),
        checksum: `blake3:${'b'.repeat(64)}`,
      };
      mockToolFiles([blake3, listedFile('dummy-any.tar.gz')]);
      scope(baseUrl)
        .get('/files/dummy-any.tar.gz')
        .reply(200, 'dummy-any.tar.gz');

      expect(await svc.downloadToolFile('dummy', '1.0.0')).toMatch(
        /dummy-any\.tar\.gz$/,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        { tool: 'dummy', version: '1.0.0', checksum: blake3.checksum },
        'unsupported tool-versions file checksum',
      );
    });

    test('does not warn about an unsupported checksum of another host', async () => {
      mockToolFiles([
        {
          ...listedFile('dummy-blake3-arm64.tar.gz', { arch: 'arm64' }),
          checksum: `blake3:${'b'.repeat(64)}`,
        },
        {
          ...listedFile('dummy-blake3-jammy.tar.gz', { distro: 'jammy' }),
          checksum: `blake3:${'c'.repeat(64)}`,
        },
        listedFile('dummy-other-host.tar.gz'),
      ]);
      scope(baseUrl)
        .get('/files/dummy-other-host.tar.gz')
        .reply(200, 'dummy-other-host.tar.gz');

      expect(await svc.downloadToolFile('dummy', '1.0.0')).toMatch(
        /dummy-other-host\.tar\.gz$/,
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('has no file without data', async () => {
      mockToolFiles();

      expect(await svc.downloadToolFile('dummy', '1.0.0')).toBeUndefined();
      // no data isn't a missing file, and needs no distro
      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.anything(),
        'no tool-versions file for the host',
      );
      expect(getDistro).not.toHaveBeenCalled();
    });

    test('has no file without one for the host', async () => {
      mockToolFiles(files);

      expect(
        await svc.downloadToolFile('dummy', '1.0.0', 'resolute'),
      ).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'dummy', version: '1.0.0', arch: 'amd64', distro: 'resolute' },
        'no tool-versions file for the host',
      );
    });

    test('logs the host codename for a missing file', async () => {
      mockToolFiles(files);

      expect(
        await svc.downloadToolFile('dummy', '1.0.0', undefined, () => false),
      ).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'dummy', version: '1.0.0', arch: 'amd64', distro: 'noble' },
        'no tool-versions file for the host',
      );
    });
  });

  test('downloadNamedToolFile downloads the file with the name', async () => {
    mockToolFiles([
      listedFile('dummy-first.tar.gz'),
      listedFile('dummy-second.tar.gz'),
    ]);
    scope(baseUrl)
      .get('/files/dummy-second.tar.gz')
      .reply(200, 'dummy-second.tar.gz');

    expect(
      await svc.downloadNamedToolFile('dummy', '1.0.0', 'dummy-second.tar.gz'),
    ).toMatch(/dummy-second\.tar\.gz$/);
  });

  describe('downloadDistroToolFile', () => {
    /**
     * Mocks the files of the dummy version `2.0.0`, one per distro for amd64.
     * @returns the spy of the lookups
     */
    function mockFiles(
      distros: string[],
    ): MockInstance<ToolVersionsService['getVersionFiles']> {
      return mockToolFiles(
        distros.map((distro) =>
          listedFile(`dummy-2-${distro}.tar.gz`, { arch: 'amd64', distro }),
        ),
      );
    }

    test.each([
      { distros: ['jammy', 'noble'], host: 'noble', file: 'noble', lookups: 1 },
      { distros: ['jammy'], host: 'noble', file: 'jammy', lookups: 2 },
    ])(
      'downloads the $file file on $host from $distros',
      async ({ distros, host, file, lookups }) => {
        const spy = mockFiles(distros);
        const name = `dummy-2-${file}.tar.gz`;
        scope(baseUrl).get(`/files/${name}`).reply(200, name);

        expect(
          await svc.downloadDistroToolFile('dummy', '2.0.0', host, 'jammy'),
        ).toMatch(name);
        expect(spy).toHaveBeenCalledTimes(lookups);
      },
    );

    test('looks up a fallback equal to the host only once', async () => {
      const spy = mockFiles(['noble']);

      expect(
        await svc.downloadDistroToolFile('dummy', '2.0.0', 'jammy', 'jammy'),
      ).toBeUndefined();
      expect(spy).toHaveBeenCalledOnce();
    });

    test('has no file without one for the host or the fallback', async () => {
      const spy = mockFiles(['focal']);

      expect(
        await svc.downloadDistroToolFile('dummy', '2.0.0', 'noble', 'jammy'),
      ).toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('selectToolFile', () => {
    const generic = listedFile('generic');
    const amd64 = listedFile('amd64', { arch: 'amd64' });
    const arm64 = listedFile('arm64', { arch: 'arm64' });
    const jammy = listedFile('jammy', { distro: 'jammy' });
    const jammyAmd64 = listedFile('jammy-amd64', {
      arch: 'amd64',
      distro: 'jammy',
    });

    test.each([
      {
        name: 'the exact file over generic ones',
        files: [generic, amd64, jammy, jammyAmd64],
        expected: jammyAmd64,
      },
      {
        name: 'an arch specific file over a generic one',
        files: [generic, amd64, arm64],
        expected: amd64,
      },
      {
        name: 'a distro specific file over a generic one',
        files: [generic, jammy],
        expected: jammy,
      },
      {
        name: 'the first of equal files',
        files: [amd64, jammy],
        expected: amd64,
      },
      { name: 'a generic file', files: [arm64, generic], expected: generic },
    ])('picks $name', ({ files, expected }) => {
      expect(selectToolFile(files, 'amd64', 'jammy')).toBe(expected);
    });

    test('has no file of another arch or distro', () => {
      const noble = listedFile('noble', { distro: 'noble' });

      expect(selectToolFile([arm64, noble], 'amd64', 'jammy')).toBeUndefined();
      expect(selectToolFile([], 'amd64', 'jammy')).toBeUndefined();
    });
  });
});
