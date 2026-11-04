import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ToolFile } from '../../../packages/base/src/tool-versions-types.ts';
import type { HttpChecksumType } from '../services/http.service.ts';
import {
  LinkToolService,
  PathService,
  ToolFilesService,
} from '../services/index.ts';
import { getDistro } from '../utils/index.ts';
import { BaseInstallService } from './base-install.service.ts';
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

  /** Exposes the protected `findToolFile` to the tests. */
  findFile(
    version: string,
    distro?: string,
    filter?: (file: ToolFile) => boolean,
  ): Promise<{ file: ToolFile | undefined; distro: string } | undefined> {
    return this.findToolFile(version, distro, filter);
  }

  /** Exposes the protected `downloadListedFile` to the tests. */
  downloadFile(file: ToolFile): Promise<string> {
    return this.downloadListedFile(file);
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

  test('downloads the tool-versions files of the tool', async () => {
    const file = listedFile('dummy.tar.gz');
    const filter = (): boolean => true;
    const download = vi
      .spyOn(ToolFilesService.prototype, 'downloadToolFile')
      .mockResolvedValue('/tmp/dummy.tar.gz');
    const find = vi
      .spyOn(ToolFilesService.prototype, 'findToolFile')
      .mockResolvedValue({ file, distro: 'noble' });
    const listed = vi
      .spyOn(ToolFilesService.prototype, 'downloadListedFile')
      .mockResolvedValue('/tmp/listed.tar.gz');
    const distro = vi
      .spyOn(ToolFilesService.prototype, 'downloadDistroToolFile')
      .mockResolvedValue('/tmp/distro.tar.gz');

    expect(await svc.download('1.0.0', 'jammy', filter)).toBe(
      '/tmp/dummy.tar.gz',
    );
    expect(await svc.findFile('1.0.0', 'jammy', filter)).toEqual({
      file,
      distro: 'noble',
    });
    expect(await svc.downloadFile(file)).toBe('/tmp/listed.tar.gz');
    expect(await svc.downloadDistro('1.0.0', 'noble', 'jammy')).toBe(
      '/tmp/distro.tar.gz',
    );
    expect(download).toHaveBeenCalledWith('dummy', '1.0.0', 'jammy', filter);
    expect(find).toHaveBeenCalledWith('dummy', '1.0.0', 'jammy', filter);
    expect(listed).toHaveBeenCalledWith(file);
    expect(distro).toHaveBeenCalledWith('dummy', '1.0.0', 'noble', 'jammy');
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
