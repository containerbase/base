import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import {
  type MockInstance,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import type { ToolFile } from '../../../packages/base/src/tool-versions-types.ts';
import type { HttpChecksumType } from '../services/http.service.ts';
import {
  LinkToolService,
  PathService,
  ToolVersionsService,
} from '../services/index.ts';
import { getDistro, logger } from '../utils/index.ts';
import { BaseInstallService, selectToolFile } from './base-install.service.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths, rootPath } from '~test/path.ts';
import { checksum, mockToolFiles } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

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
    url: `https://example.test/files/${name}`,
    checksum: `sha256:${checksum(name, 'sha256')}`,
    ...props,
  };
}

@injectable()
@injectFromHierarchy()
class DummyInstallService extends BaseInstallService {
  readonly name: string = 'dummy';

  /** Does nothing, for tests. */
  override install(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** Links the versioned tool path. */
  override link(version: string): Promise<void> {
    return this.shellwrapper({
      srcDir: this.pathSvc.versionedToolPath(this.name, version),
    });
  }

  /** Exposes the protected `symlink` to the tests. */
  linkBinary(version: string): Promise<void> {
    return this.symlink({
      srcDir: this.pathSvc.versionedToolPath(this.name, version),
    });
  }

  /** Exposes the protected `_spawn` to the tests. */
  run(command: string, args: string[]): Promise<unknown> {
    return this._spawn(command, args);
  }

  /** Exposes the protected `getChecksum` to the tests. */
  checksum(url: string): Promise<string> {
    return this.getChecksum(url);
  }

  /** Exposes the protected `findChecksum` to the tests. */
  find(url: string, filename: string): Promise<string> {
    return this.findChecksum(url, filename);
  }

  /** Exposes the protected `downloadChecksumListed` to the tests. */
  downloadListed(
    version: string,
    baseUrl: string,
    filename: string,
    list: string,
  ): Promise<string> {
    return this.downloadChecksumListed(version, baseUrl, filename, list);
  }

  /** Exposes the protected `downloadChecksumSidecar` to the tests. */
  downloadSidecar(
    version: string,
    url: string,
    sidecar: string,
    options?: { checksumType?: HttpChecksumType; name?: string },
  ): Promise<string> {
    return this.downloadChecksumSidecar(version, url, sidecar, options);
  }

  /** Exposes the protected `downloadWithoutChecksum` to the tests. */
  downloadUnverified(
    version: string,
    url: string,
    name?: string,
  ): Promise<string> {
    return this.downloadWithoutChecksum(version, url, name);
  }

  /** Exposes the protected `downloadToolFile` to the tests. */
  download(
    version: string,
    distro?: string,
    filter?: (file: ToolFile) => boolean,
  ): Promise<string | undefined> {
    return this.downloadToolFile(version, distro, filter);
  }

  /** Exposes the protected `downloadDistroToolFile` to the tests. */
  downloadDistro(
    version: string,
    host: string,
    fallback: string,
  ): Promise<string | undefined> {
    return this.downloadDistroToolFile(version, host, fallback);
  }
}

/** `bun` is listed in both `NoPrepareTools` and `NoInitTools`. */
@injectable()
@injectFromHierarchy()
class BunInstallService extends DummyInstallService {
  override readonly name = 'bun';
}

describe('cli/install-tool/base-install.service', () => {
  let child!: Container;
  let pathSvc!: PathService;
  let svc!: DummyInstallService;

  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/bin',
      'opt/containerbase/tools',
      'tmp/containerbase/tool.init.d',
      'var/lib/containerbase/tool.prep.d',
    ]);
  });

  beforeEach(async () => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    child = await testContainer();
    child.bind(DummyInstallService).toSelf();
    child.bind(BunInstallService).toSelf();
    pathSvc = await child.getAsync(PathService);
    svc = await child.getAsync(DummyInstallService);
  });

  test('name and alias', () => {
    expect(svc.name).toBe('dummy');
    expect(svc.alias).toBe('dummy');
    expect(svc.parent).toBeUndefined();
    expect(svc.type).toBeUndefined();
    expect(svc.toString()).toBe('dummy');
  });

  test('isInstalled', async () => {
    expect(await svc.isInstalled('1.0.0')).toBe(false);

    await pathSvc.createVersionedToolPath('dummy', '1.0.0');
    expect(await svc.isInstalled('1.0.0')).toBe(true);
  });

  test('isInitialized', async () => {
    expect(await svc.isInitialized()).toBe(false);

    await pathSvc.setInitialized('dummy');
    expect(await svc.isInitialized()).toBe(true);
  });

  test('isPrepared', async () => {
    expect(await svc.isPrepared()).toBe(false);

    await pathSvc.setPrepared('dummy');
    expect(await svc.isPrepared()).toBe(true);
  });

  test('needsInitialize and needsPrepare', async () => {
    expect(svc.needsInitialize()).toBe(true);
    expect(svc.needsPrepare()).toBe(true);

    const bun = await child.getAsync(BunInstallService);
    expect(bun.needsInitialize()).toBe(false);
    expect(bun.needsPrepare()).toBe(false);
  });

  test('postInstall and test are no-ops', async () => {
    await expect(svc.postInstall('1.0.0')).resolves.toBeUndefined();
    await expect(svc.test('1.0.0')).resolves.toBeUndefined();
  });

  test('uninstall removes the versioned tool path', async () => {
    const path = await pathSvc.createVersionedToolPath('dummy', '2.0.0');

    await expect(svc.uninstall('2.0.0')).resolves.toBeUndefined();

    await expect(fs.stat(path)).rejects.toThrow();
    // uninstalling an unknown version is a no-op
    await expect(svc.uninstall('2.0.0')).resolves.toBeUndefined();
  });

  test('validate', async () => {
    expect(await svc.validate('1.0.0')).toBe(true);
    expect(await svc.validate('not-a-version')).toBe(false);
  });

  test('shellwrapper links with the tool name', async () => {
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.0.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('dummy', {
      srcDir: pathSvc.versionedToolPath('dummy', '1.0.0'),
    });
    expect(await fs.readFile(join(pathSvc.binDir, 'dummy'), 'utf8')).toContain(
      'containerbase-cli init tool "dummy"',
    );
  });

  test('symlink links with the tool name', async () => {
    const spy = vi.spyOn(LinkToolService.prototype, 'symlink');
    const src = pathSvc.versionedToolPath('dummy', '3.0.0');

    await expect(svc.linkBinary('3.0.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('dummy', { srcDir: src });
    expect(await fs.readlink(join(pathSvc.binDir, 'dummy'))).toBe(
      join(src, 'dummy'),
    );
  });

  describe('getChecksum', () => {
    const baseUrl = 'https://example.test';

    test.each([
      { name: 'bare', content: 'abc\n' },
      { name: 'named', content: 'abc  tool.tar.gz\n' },
    ])('reads a $name checksum', async ({ name, content }) => {
      scope(baseUrl).get(`/${name}/tool.sha256`).reply(200, content);

      await expect(
        svc.checksum(`${baseUrl}/${name}/tool.sha256`),
      ).resolves.toBe('abc');
    });

    test('throws on an empty checksum', async () => {
      scope(baseUrl).get('/empty/tool.sha256').reply(200, '\n');

      await expect(
        svc.checksum(`${baseUrl}/empty/tool.sha256`),
      ).rejects.toThrow('Checksum not found');
    });
  });

  describe('findChecksum', () => {
    const baseUrl = 'https://example.test';

    test('finds the exact filename in a list', async () => {
      scope(baseUrl)
        .get('/list/SHA256SUMS')
        .reply(
          200,
          'aaa  tool-amd64.sig\nbbb  debug-tool-amd64\nccc  ./sub/tool-amd64\ndef  tool-amd64\r\n',
        );

      await expect(
        svc.find(`${baseUrl}/list/SHA256SUMS`, 'tool-amd64'),
      ).resolves.toBe('def');
    });

    test.each([
      { name: 'binary mode', line: 'abc *tool-amd64' },
      { name: 'relative', line: 'abc  ./tool-amd64' },
    ])('finds a $name entry', async ({ name, line }) => {
      const path = `/${name.replace(' ', '-')}/SHA256SUMS`;
      scope(baseUrl).get(path).reply(200, `${line}\n`);

      await expect(svc.find(`${baseUrl}${path}`, 'tool-amd64')).resolves.toBe(
        'abc',
      );
    });

    test.each(['utf8', 'utf16le'] as const)(
      'strips the BOM of a %s list',
      async (encoding) => {
        const bom = String.fromCharCode(0xfeff);
        scope(baseUrl)
          .get(`/${encoding}/hashes.sha256`)
          .reply(200, Buffer.from(`${bom}abc *tool-amd64\r\n`, encoding));

        await expect(
          svc.find(`${baseUrl}/${encoding}/hashes.sha256`, 'tool-amd64'),
        ).resolves.toBe('abc');
      },
    );

    test('throws on a missing checksum', async () => {
      scope(baseUrl).get('/missing/SHA256SUMS').reply(200, 'abc  tool-arm64\n');

      await expect(
        svc.find(`${baseUrl}/missing/SHA256SUMS`, 'tool-amd64'),
      ).rejects.toThrow(
        `Checksum not found in ${baseUrl}/missing/SHA256SUMS for tool-amd64`,
      );
    });
  });

  describe('downloadChecksumListed', () => {
    const baseUrl = 'https://example.test';

    test('downloads the file of the data with the name', async () => {
      // the other file of the arch comes first
      mockToolFiles([
        listedFile('tool-amd64-musl.tar.gz', { arch: 'amd64' }),
        listedFile('tool-amd64.tar.gz', { arch: 'amd64' }),
      ]);
      // there is no interceptor for the list
      scope(baseUrl)
        .get('/files/tool-amd64.tar.gz')
        .reply(200, 'tool-amd64.tar.gz');

      const file = await svc.downloadListed(
        '1.0.0',
        `${baseUrl}/files/`,
        'tool-amd64.tar.gz',
        'SHA256SUMS',
      );

      expect(await fs.readFile(file, 'utf8')).toBe('tool-amd64.tar.gz');
    });

    test.each([
      { data: 'no data', path: '/release', files: undefined },
      {
        data: 'no file with the name',
        path: '/unnamed',
        files: [listedFile('tool-amd64-musl.tar.gz', { arch: 'amd64' })],
      },
    ])(
      'downloads the file verified against the list with $data',
      async ({ path, files }) => {
        mockToolFiles(files);
        scope(baseUrl)
          .get(`${path}/SHA256SUMS`)
          .reply(200, `${checksum('tool')}  tool-amd64.tar.gz\n`)
          .get(`${path}/tool-amd64.tar.gz`)
          .reply(200, 'tool');

        const file = await svc.downloadListed(
          '1.0.0',
          `${baseUrl}${path}/`,
          'tool-amd64.tar.gz',
          'SHA256SUMS',
        );

        expect(await fs.readFile(file, 'utf8')).toBe('tool');
      },
    );

    test('throws on a missing checksum', async () => {
      mockToolFiles();
      scope(baseUrl)
        .get('/unlisted/SHA256SUMS')
        .reply(200, `${checksum('tool')}  tool-arm64.tar.gz\n`);

      await expect(
        svc.downloadListed(
          '1.0.0',
          `${baseUrl}/unlisted/`,
          'tool-amd64.tar.gz',
          'SHA256SUMS',
        ),
      ).rejects.toThrow(
        `Checksum not found in ${baseUrl}/unlisted/SHA256SUMS for tool-amd64.tar.gz`,
      );
    });
  });

  describe('downloadChecksumSidecar', () => {
    const baseUrl = 'https://example.test';

    test.each([
      { options: undefined, sidecar: '.sha256', type: 'sha256' },
      {
        options: { checksumType: 'sha512' },
        sidecar: '.sha512',
        type: 'sha512',
      },
    ] as const)(
      'downloads the file verified against its $sidecar',
      async ({ options, sidecar, type }) => {
        mockToolFiles();
        const path = `/sidecar/tool-${type}.tar.gz`;
        scope(baseUrl)
          .get(`${path}${sidecar}`)
          .reply(200, `${checksum('tool', type)}  tool.tar.gz\n`)
          .get(path)
          .reply(200, 'tool');

        const file = await svc.downloadSidecar(
          '1.0.0',
          `${baseUrl}${path}`,
          sidecar,
          options,
        );

        expect(await fs.readFile(file, 'utf8')).toBe('tool');
      },
    );

    test('downloads the file of the data named like the url', async () => {
      mockToolFiles([
        listedFile('tool-x64-musl.tar.gz', { arch: 'amd64' }),
        listedFile('tool-x64.tar.gz', { arch: 'amd64' }),
      ]);
      // there is no interceptor for the sidecar
      scope(baseUrl)
        .get('/files/tool-x64.tar.gz')
        .reply(200, 'tool-x64.tar.gz');

      const file = await svc.downloadSidecar(
        '1.0.0',
        `${baseUrl}/files/tool-x64.tar.gz`,
        '.sha256',
      );

      expect(await fs.readFile(file, 'utf8')).toBe('tool-x64.tar.gz');
    });

    test.each([
      { data: 'the data', path: '/named-data' },
      { data: 'the sidecar', path: '/named-sidecar' },
    ])(
      'downloads a named file verified against $data',
      async ({ data, path }) => {
        const url = `${baseUrl}${path}/tool`;
        mockToolFiles(
          data === 'the data'
            ? [
                {
                  name: 'tool-v1.0.0-amd64',
                  url,
                  checksum: `sha256:${checksum('tool')}`,
                  arch: 'amd64',
                },
              ]
            : [],
        );
        const s = scope(baseUrl);
        if (data === 'the sidecar') {
          s.get(`${path}/tool.sha256`).reply(200, checksum('tool'));
        }
        s.get(`${path}/tool`).reply(200, 'tool');

        const file = await svc.downloadSidecar('1.0.0', url, '.sha256', {
          name: 'tool-v1.0.0-amd64',
        });

        expect(file).toMatch(/\/tool-v1\.0\.0-amd64$/);
        expect(await fs.readFile(file, 'utf8')).toBe('tool');
      },
    );

    test('names the file like the url for a name with a path', async () => {
      mockToolFiles([]);
      scope(baseUrl)
        .get('/pathname/tool.sha256')
        .reply(200, checksum('tool'))
        .get('/pathname/tool')
        .reply(200, 'tool');

      const file = await svc.downloadSidecar(
        '1.0.0',
        `${baseUrl}/pathname/tool`,
        '.sha256',
        { name: '../tool-up' },
      );

      expect(file).toMatch(/\/[0-9a-f]+\/tool$/);
    });

    test('matches the decoded url name in the data', async () => {
      // the data has the decoded name
      mockToolFiles([
        {
          name: 'tool+1.tar.gz',
          url: `${baseUrl}/encoded/tool%2B1.tar.gz`,
          checksum: `sha256:${checksum('tool+1')}`,
        },
      ]);
      // there is no interceptor for the sidecar
      scope(baseUrl).get('/encoded/tool%2B1.tar.gz').reply(200, 'tool+1');

      const file = await svc.downloadSidecar(
        '1.0.0',
        `${baseUrl}/encoded/tool%2B1.tar.gz`,
        '.sha256',
      );

      expect(await fs.readFile(file, 'utf8')).toBe('tool+1');
    });
  });

  describe('downloadWithoutChecksum', () => {
    const baseUrl = 'https://example.test';

    test('downloads the file of the data named like the url', async () => {
      mockToolFiles([listedFile('tool-old.tar.gz')]);
      scope(baseUrl)
        .get('/files/tool-old.tar.gz')
        .reply(200, 'tool-old.tar.gz');

      const file = await svc.downloadUnverified(
        '1.0.0',
        `${baseUrl}/files/tool-old.tar.gz`,
      );

      expect(await fs.readFile(file, 'utf8')).toBe('tool-old.tar.gz');
    });

    test('downloads the file without data', async () => {
      mockToolFiles();
      scope(baseUrl).get('/unverified/tool.tar.gz').reply(200, 'any');

      const file = await svc.downloadUnverified(
        '1.0.0',
        `${baseUrl}/unverified/tool.tar.gz`,
      );

      expect(await fs.readFile(file, 'utf8')).toBe('any');
    });

    test.each([
      { data: 'the data', path: '/unverified-data' },
      { data: 'no data', path: '/unverified-none' },
    ])('downloads a named file with $data', async ({ data, path }) => {
      const url = `${baseUrl}${path}/tool.tgz`;
      mockToolFiles(
        data === 'the data'
          ? [
              {
                name: 'tool-1.0.0-x86_64.tgz',
                url,
                checksum: `sha256:${checksum('tool')}`,
              },
            ]
          : undefined,
      );
      scope(baseUrl).get(`${path}/tool.tgz`).reply(200, 'tool');

      const file = await svc.downloadUnverified(
        '1.0.0',
        url,
        'tool-1.0.0-x86_64.tgz',
      );

      expect(file).toMatch(/\/tool-1\.0\.0-x86_64\.tgz$/);
      expect(await fs.readFile(file, 'utf8')).toBe('tool');
    });

    test('verifies a named file against the checksum of the data', async () => {
      const url = `${baseUrl}/unverified-mismatch/tool.tgz`;
      mockToolFiles([
        {
          name: 'tool-1.0.0-x86_64.tgz',
          url,
          checksum: `sha256:${checksum('other')}`,
        },
      ]);
      scope(baseUrl)
        .get('/unverified-mismatch/tool.tgz')
        .times(3)
        .reply(200, 'tool');

      await expect(
        svc.downloadUnverified('1.0.0', url, 'tool-1.0.0-x86_64.tgz'),
      ).rejects.toThrow('download failed');
    });
  });

  describe('downloadToolFile', () => {
    const baseUrl = 'https://example.test';
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
      mockToolFiles(files);
      scope(baseUrl)
        .get('/files/dummy-noble-amd64.tar.gz')
        .reply(200, 'dummy-noble-amd64.tar.gz');

      const file = await svc.download('1.0.0');

      expect(file).toMatch(/dummy-noble-amd64\.tar\.gz$/);
      expect(await fs.readFile(file!, 'utf8')).toBe('dummy-noble-amd64.tar.gz');
    });

    test('downloads the file of the given distro', async () => {
      mockToolFiles(files);
      scope(baseUrl)
        .get('/files/dummy-jammy-amd64.tar.gz')
        .reply(200, 'dummy-jammy-amd64.tar.gz');

      expect(await svc.download('1.0.0', 'jammy')).toMatch(
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
        await svc.download(
          '1.0.0',
          undefined,
          (f) => f.name === 'dummy-other.tar.gz',
        ),
      ).toMatch(/dummy-other\.tar\.gz$/);
      expect(
        await svc.download('1.0.0', undefined, () => false),
      ).toBeUndefined();
    });

    test('names the file like the data, not like the url', async () => {
      mockToolFiles([
        { ...listedFile('dummy-named.tar.gz'), url: `${baseUrl}/abc` },
      ]);
      scope(baseUrl).get('/abc').reply(200, 'dummy-named.tar.gz');

      expect(await svc.download('1.0.0')).toMatch(
        /\/[0-9a-f]+\/dummy-named\.tar\.gz$/,
      );
    });

    test('throws on a checksum mismatch', async () => {
      mockToolFiles([listedFile('dummy-tampered.tar.gz')]);
      scope(baseUrl)
        .get('/files/dummy-tampered.tar.gz')
        .times(3)
        .reply(200, 'tampered');

      await expect(svc.download('1.0.0')).rejects.toThrow('download failed');
    });

    test.each([{ checksum: `md5:${'a'.repeat(32)}` }, { checksum: 'sha256' }])(
      'has no file for an unsupported checksum $checksum',
      async ({ checksum }) => {
        // a download would find no interceptor and fail the test
        mockToolFiles([{ ...listedFile('dummy-md5.tar.gz'), checksum }]);

        expect(await svc.download('1.0.0')).toBeUndefined();
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

      expect(await svc.download('1.0.0')).toMatch(/dummy-any\.tar\.gz$/);
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

      expect(await svc.download('1.0.0')).toMatch(/dummy-other-host\.tar\.gz$/);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    test('has no file without data', async () => {
      mockToolFiles();

      expect(await svc.download('1.0.0')).toBeUndefined();
      // no data isn't a missing file, and needs no distro
      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.anything(),
        'no tool-versions file for the host',
      );
      expect(getDistro).not.toHaveBeenCalled();
    });

    test('has no file without one for the host', async () => {
      mockToolFiles(files);

      expect(await svc.download('1.0.0', 'resolute')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'dummy', version: '1.0.0', arch: 'amd64', distro: 'resolute' },
        'no tool-versions file for the host',
      );
    });

    test('logs the host codename for a missing file', async () => {
      mockToolFiles(files);

      expect(
        await svc.download('1.0.0', undefined, () => false),
      ).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'dummy', version: '1.0.0', arch: 'amd64', distro: 'noble' },
        'no tool-versions file for the host',
      );
    });
  });

  describe('downloadDistroToolFile', () => {
    const baseUrl = 'https://example.test';

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

        expect(await svc.downloadDistro('2.0.0', host, 'jammy')).toMatch(name);
        expect(spy).toHaveBeenCalledTimes(lookups);
      },
    );

    test('looks up a fallback equal to the host only once', async () => {
      const spy = mockFiles(['noble']);

      expect(
        await svc.downloadDistro('2.0.0', 'jammy', 'jammy'),
      ).toBeUndefined();
      expect(spy).toHaveBeenCalledOnce();
    });

    test('has no file without one for the host or the fallback', async () => {
      const spy = mockFiles(['focal']);

      expect(
        await svc.downloadDistro('2.0.0', 'noble', 'jammy'),
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

  test('_spawn runs in the temp dir', async () => {
    execaMock.mockResolvedValue({ failed: false });

    await expect(svc.run('dummy', ['--version'])).resolves.toBeDefined();

    expect(execaMock).toHaveBeenCalledWith(
      'dummy',
      ['--version'],
      expect.objectContaining({
        cwd: rootPath('tmp'),
        node: false,
        preferLocal: false,
      }),
    );
  });
});
