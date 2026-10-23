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
import { checksum } from '~test/tool.ts';

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

/** A file of a version for the tests. */
function toolFile(
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

  /** Exposes the protected `downloadToolFile` to the tests. */
  download(version: string, distro?: string): Promise<string | undefined> {
    return this.downloadToolFile(version, distro);
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

  describe('downloadToolFile', () => {
    const baseUrl = 'https://example.test';
    const files = [
      toolFile('dummy-arm64.tar.gz', { arch: 'arm64' }),
      toolFile('dummy-jammy-amd64.tar.gz', { arch: 'amd64', distro: 'jammy' }),
      toolFile('dummy-noble-amd64.tar.gz', { arch: 'amd64', distro: 'noble' }),
    ];

    /** Mocks the files of the dummy version `1.0.0`. */
    function mockFiles(list: ToolFile[]): void {
      vi.spyOn(
        ToolVersionsService.prototype,
        'getVersionFiles',
      ).mockResolvedValue({ tool: 'dummy', version: '1.0.0', files: list });
    }

    test('downloads the file of the host distro and arch', async () => {
      mockFiles(files);
      scope(baseUrl)
        .get('/files/dummy-noble-amd64.tar.gz')
        .reply(200, 'dummy-noble-amd64.tar.gz');

      const file = await svc.download('1.0.0');

      expect(file).toMatch(/dummy-noble-amd64\.tar\.gz$/);
      expect(await fs.readFile(file!, 'utf8')).toBe('dummy-noble-amd64.tar.gz');
    });

    test('downloads the file of the given distro', async () => {
      mockFiles(files);
      scope(baseUrl)
        .get('/files/dummy-jammy-amd64.tar.gz')
        .reply(200, 'dummy-jammy-amd64.tar.gz');

      expect(await svc.download('1.0.0', 'jammy')).toMatch(
        /dummy-jammy-amd64\.tar\.gz$/,
      );
    });

    test('throws on a checksum mismatch', async () => {
      mockFiles([toolFile('dummy-tampered.tar.gz')]);
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
        mockFiles([{ ...toolFile('dummy-md5.tar.gz'), checksum }]);

        expect(await svc.download('1.0.0')).toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(
          { tool: 'dummy', version: '1.0.0', checksum },
          'unsupported tool-versions file checksum',
        );
      },
    );

    test('has no file without data', async () => {
      vi.spyOn(
        ToolVersionsService.prototype,
        'getVersionFiles',
      ).mockResolvedValue(undefined);

      expect(await svc.download('1.0.0')).toBeUndefined();
    });

    test('has no file without one for the host', async () => {
      mockFiles(files);

      expect(await svc.download('1.0.0', 'resolute')).toBeUndefined();
      expect(logger.debug).toHaveBeenCalledWith(
        { tool: 'dummy', version: '1.0.0', arch: 'amd64', distro: 'resolute' },
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
      return vi
        .spyOn(ToolVersionsService.prototype, 'getVersionFiles')
        .mockResolvedValue({
          tool: 'dummy',
          version: '2.0.0',
          files: distros.map((distro) =>
            toolFile(`dummy-2-${distro}.tar.gz`, { arch: 'amd64', distro }),
          ),
        });
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
    const generic = toolFile('generic');
    const amd64 = toolFile('amd64', { arch: 'amd64' });
    const arm64 = toolFile('arm64', { arch: 'arm64' });
    const jammy = toolFile('jammy', { distro: 'jammy' });
    const jammyAmd64 = toolFile('jammy-amd64', {
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
      const noble = toolFile('noble', { distro: 'noble' });

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
