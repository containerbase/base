import fs from 'node:fs/promises';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  IpcServer,
  PathService,
  ToolVersionsService,
  VersionService,
  createContainer,
} from '../services/index.ts';
import { NpmVersionResolver } from '../tools/node/resolver.ts';
import { NpmBaseInstallService } from '../tools/node/utils.ts';
import { PipVersionResolver } from '../tools/python/pip.ts';
import { PipBaseInstallService } from '../tools/python/utils.ts';
import { RubyInstallService } from '../tools/ruby/index.ts';
import {
  RubyBaseInstallService,
  RubyGemVersionResolver,
} from '../tools/ruby/utils.ts';
import { BlockingChild, MissingParent, NotSupported } from '../utils/codes.ts';
import { isDockerBuild, logger, pathExists } from '../utils/index.ts';
import {
  installTool,
  linkTool,
  listSupportedTools,
  resolveVersion,
  uninstallTool,
} from './index.ts';
import { V2ToolInstallService } from './install-legacy-tool.service.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths, rootPath } from '~test/path.ts';

vi.mock('del');
vi.mock('execa');
vi.mock('../tools/bun.ts');
vi.mock('../tools/php/composer.ts');
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  isDockerBuild: vi.fn(),
}));

/** Lets `fs.access` fail with the error code for the path only. */
function failAccess(path: string, code: string): void {
  vi.spyOn(fs, 'access').mockImplementation((p) =>
    p === path
      ? Promise.reject(Object.assign(new Error(code), { code }))
      : Promise.resolve(),
  );
}

describe('cli/install-tool/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'tmp/containerbase/tool.init.d',
      'usr/local/containerbase/tools/v2',
      'var/lib/containerbase/tool.prep.d',
    ]);

    await fs.writeFile(
      rootPath('usr/local/containerbase/tools/v2/dummy.sh'),
      '',
    );

    await fs.writeFile(rootPath('usr/local/containerbase/tools/leg.sh'), '');

    const verSvc = await createContainer().getAsync(VersionService);

    await verSvc.addInstalled({ name: 'node', version: '1.0.0' });
    await verSvc.addInstalled({ name: 'python', version: '1.0.0' });
    await verSvc.addInstalled({ name: 'ruby', version: '1.0.0' });

    await verSvc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: '1.0.0' },
    });
    await verSvc.setCurrent({
      name: 'python',
      tool: { name: 'python', version: '1.0.0' },
    });
    await verSvc.setCurrent({
      name: 'ruby',
      tool: { name: 'ruby', version: '1.0.0' },
    });

    await verSvc.addInstalled({ name: 'node', version: '1.0.1' });
    await verSvc.addInstalled({
      name: 'pnpm',
      version: '1.0.0',
      parent: { name: 'node', version: '1.0.1' },
    });
  });

  describe('installTool', () => {
    test('fails if parent is missing', async () => {
      vi.mocked(isDockerBuild).mockResolvedValueOnce(true);
      expect(await installTool('gradle', '1.0.0')).toBe(MissingParent);
      expect(logger.fatal).toHaveBeenCalledExactlyOnceWith(
        { tool: 'gradle', parent: 'java' },
        'parent tool not installed',
      );
    });

    test('works', async () => {
      expect(await installTool('bun', '1.0.0')).toBeUndefined();
      expect(await installTool('dummy', '1.0.0')).toBeUndefined();
      expect(await installTool('dummy', '1.0.0')).toBeUndefined();
      expect(await installTool('leg', '1.0.0', true)).toBeUndefined();
      expect(await installTool('leg', '1.0.0')).toBeUndefined();
      expect(await installTool('a', '1.0.0')).toBe(1);
    });

    test.each([
      {
        type: 'gem' as const,
        svc: RubyBaseInstallService,
      },
      {
        type: 'npm' as const,
        svc: NpmBaseInstallService,
      },
      {
        type: 'pip' as const,
        svc: PipBaseInstallService,
      },
    ])('works: $type', async ({ type, svc }) => {
      vi.spyOn(svc.prototype, 'install').mockResolvedValue();
      vi.spyOn(svc.prototype, 'needsInitialize').mockReturnValue(false);
      vi.spyOn(svc.prototype, 'validate').mockResolvedValue(true);
      vi.spyOn(svc.prototype, 'postInstall').mockResolvedValue();
      vi.spyOn(svc.prototype, 'test').mockRejectedValue(new Error('test'));
      expect(
        await installTool(`dummy-${type}`, '1.0.0', false, type),
      ).toBeUndefined();
    });

    test('prefers a modern service over a v2 shell tool with the same name', async () => {
      const script = rootPath('usr/local/containerbase/tools/v2/ruby.sh');
      await fs.writeFile(script, '');
      const proto = RubyInstallService.prototype;
      vi.spyOn(proto, 'needsPrepare').mockReturnValue(false);
      vi.spyOn(proto, 'needsInitialize').mockReturnValue(false);
      vi.spyOn(proto, 'validate').mockResolvedValue(true);
      vi.spyOn(proto, 'link').mockResolvedValue();
      vi.spyOn(proto, 'postInstall').mockResolvedValue();
      vi.spyOn(proto, 'test').mockResolvedValue();
      const ruby = vi.spyOn(proto, 'install').mockResolvedValue();
      const v2 = vi.spyOn(V2ToolInstallService.prototype, 'install');

      try {
        expect(await installTool('ruby', '3.4.11')).toBeUndefined();
      } finally {
        await fs.rm(script);
      }

      expect(ruby).toHaveBeenCalledExactlyOnceWith('3.4.11');
      expect(v2).not.toHaveBeenCalled();
    });

    test('rethrows a failing test for a known pip tool', async () => {
      // unlike the `dummy-*` tools above, `poetry` is in the `ResolverMap`, so
      // its `--version` flag is expected to work
      vi.spyOn(PipBaseInstallService.prototype, 'install').mockResolvedValue();
      vi.spyOn(
        PipBaseInstallService.prototype,
        'needsInitialize',
      ).mockReturnValue(false);
      vi.spyOn(PipBaseInstallService.prototype, 'validate').mockResolvedValue(
        true,
      );
      vi.spyOn(
        PipBaseInstallService.prototype,
        'postInstall',
      ).mockResolvedValue();
      vi.spyOn(PipBaseInstallService.prototype, 'test').mockRejectedValue(
        new Error('no --version flag'),
      );

      await expect(
        installTool('poetry', '1.0.0', false, 'pip'),
      ).rejects.toThrow('no --version flag');
    });
  });

  describe('listSupportedTools', () => {
    test('works', async () => {
      const tools = await listSupportedTools();
      const names = tools.map((t) => t.name);

      expect(names).toEqual(
        [...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      );
      // v2 shell tools are supported
      expect(names).toContain('dummy');
      // v1 shell tools have no install service to describe
      expect(names).not.toContain('leg');

      expect(tools).toEqual(
        expect.arrayContaining([
          { name: 'apko', minVersion: '0.1.1' },
          { name: 'git', root: true, minVersion: '2.48.0' },
          { name: 'nix', minVersion: '2.10.3' },
          {
            name: 'swift',
            minVersion: '5.7',
            distroMinVersion: { resolute: '6.4.0' },
          },
          { name: 'vp', parent: 'node', minVersion: '0.3.1' },
          { name: 'git-lfs', parent: 'git', minVersion: '2.6.0' },
          { name: 'maven', parent: 'java', minVersion: '3.0.4' },
          { name: 'kas', type: 'pip', parent: 'python' },
          { name: 'bower', type: 'npm', parent: 'node', deprecated: true },
          { name: 'cocoapods', type: 'gem', parent: 'ruby' },
          { name: 'conan', type: 'pip', parent: 'python' },
          { name: 'renovate', type: 'npm', parent: 'node' },
          { name: 'yarn', type: 'npm', parent: 'node' },
          { name: 'yarn-slim', type: 'npm', parent: 'node' },
          { name: 'paket', type: 'dotnet', parent: 'dotnet' },
        ]),
      );
    });
  });

  describe('resolveVersion', () => {
    test('works', async () => {
      expect(await resolveVersion('composer', '1.0.0')).toBe('1.0.0');
    });

    test.each([
      {
        type: 'gem' as const,
        svc: RubyGemVersionResolver,
      },
      {
        type: 'npm' as const,
        svc: NpmVersionResolver,
      },
      {
        type: 'pip' as const,
        svc: PipVersionResolver,
      },
    ])('works: $type', async ({ type, svc }) => {
      vi.spyOn(svc.prototype, 'resolve').mockResolvedValue('1.0.0');
      expect(await resolveVersion('dummy', '1.0.0', type)).toBe('1.0.0');
    });

    test.each(['flux', 'pnpm', 'npm', 'yarn'])(
      'resolves install-npm %s with the registry, not the tool-versions data',
      async (tool) => {
        // the data has a file with the name of the package
        await fs.mkdir(rootPath('usr/local/containerbase/tool-versions/v1'), {
          recursive: true,
        });
        await fs.writeFile(
          rootPath(`usr/local/containerbase/tool-versions/v1/${tool}.json`),
          JSON.stringify({
            tool,
            updatedAt: '2026-10-16T00:00:00Z',
            type: 'npm',
            latest: '9.9.9',
            versions: [{ version: '9.9.9' }],
          }),
        );
        const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');
        const data = vi.spyOn(
          ToolVersionsService.prototype,
          'getResolveVersions',
        );
        // the yarn resolver of install-tool is used for `yarn` too
        vi.spyOn(NpmVersionResolver.prototype, 'resolve').mockResolvedValue(
          '1.2.3',
        );

        // install-npm turns the data off
        expect(await resolveVersion(tool, 'latest', 'npm', false)).toBe(
          '1.2.3',
        );

        expect(embedded).not.toHaveBeenCalled();
        expect(data).not.toHaveBeenCalled();
      },
    );

    test.each([
      { tool: 'php', version: '8.3', type: 'npm' as const },
      { tool: 'php', version: '8.3.10', type: 'npm' as const },
      { tool: 'mise', version: '2026.10', type: 'pip' as const },
      { tool: 'mise', version: '2026.10.21', type: 'pip' as const },
    ])(
      'keeps install-$type $tool $version without the tool-versions data',
      async ({ tool, version, type }) => {
        // the resolver of install-tool answers, it keeps any version but
        // `latest`
        const embedded = vi.spyOn(ToolVersionsService.prototype, 'getVersions');

        expect(await resolveVersion(tool, version, type, false)).toBe(version);

        expect(embedded).not.toHaveBeenCalled();
      },
    );

    describe('typed gem and pip tools', () => {
      /** The embedded data, set before each test as the root dir comes from the test setup. */
      let dataDir!: string;

      /**
       * Embeds the data of a tool.
       * @param versions - the releases, newest first
       * @param minCb - the minimum containerbase version ranges, if any
       */
      async function embed(
        tool: string,
        versions: { version: string; deprecated?: true }[],
        minCb?: { version: string; cb: string }[],
      ): Promise<void> {
        await fs.writeFile(
          `${dataDir}/v1/${tool}.json`,
          JSON.stringify({
            tool,
            updatedAt: '2026-10-16T00:00:00Z',
            ...(minCb && { minCb }),
            versions,
          }),
        );
      }

      /**
       * Mocks the registry lookup of a gem or pip tool.
       * @param partial - whether a partial version is looked up, else `latest`
       * @param release - the release the registry has
       */
      function registry(
        tool: string,
        type: 'gem' | 'pip',
        partial: boolean,
        release: string,
      ): void {
        if (type === 'pip') {
          scope('https://pypi.org')
            .get(`/pypi/${tool}/json`)
            .reply(200, {
              info: { version: release },
              releases: {
                [release]: [{ packagetype: 'sdist', yanked: false }],
              },
            });
        } else if (partial) {
          scope('https://rubygems.org')
            .get(`/api/v1/versions/${tool}.json`)
            .reply(200, [{ number: release, prerelease: false }]);
        } else {
          scope('https://rubygems.org')
            .get(`/api/v1/gems/${tool}.json`)
            .reply(200, { version: release });
        }
      }

      /** Releases with deprecated ones, like yanked or removed upstream. */
      const releases = [
        { version: '2.6.0', deprecated: true as const },
        { version: '2.5.1' },
        { version: '2.5.0' },
        { version: '2.4.1', deprecated: true as const },
        { version: '2.4.0' },
      ];

      beforeEach(async () => {
        dataDir = rootPath('usr/local/containerbase/tool-versions');
        await fs.rm(`${dataDir}/v1`, { recursive: true, force: true });
        await fs.mkdir(`${dataDir}/v1`, { recursive: true });
        // the embedded data is current, so the online data isn't read
        await fs.writeFile(
          `${dataDir}/release.json`,
          JSON.stringify({
            version: '1.8.0',
            buildTime: new Date(Date.now() - 60_000).toISOString(),
          }),
        );
        vi.stubGlobal('CONTAINERBASE_VERSION', '14.51.0');
      });

      afterEach(async () => {
        vi.unstubAllGlobals();
        await fs.rm(`${dataDir}/release.json`, { force: true });
        await fs.rm(`${dataDir}/v1`, { recursive: true, force: true });
      });

      describe.each([
        { tool: 'bundler', type: 'gem' as const },
        { tool: 'uv', type: 'pip' as const },
      ])('$tool', ({ tool, type }) => {
        test.each([
          // the newest release which isn't deprecated
          { version: undefined, expected: '2.5.1' },
          { version: 'latest', expected: '2.5.1' },
          { version: '2.4', expected: '2.4.0' },
          // an existing release is kept, also a deprecated one
          { version: '2.4.1', expected: '2.4.1' },
        ])(
          'resolves $version to $expected from the data',
          async ({ version, expected }) => {
            await embed(tool, releases);

            // no interceptor, a request would fail the test
            expect(await resolveVersion(tool, version, type)).toBe(expected);
          },
        );

        test('asks the registry when only deprecated releases match', async () => {
          await embed(tool, releases);
          registry(tool, type, true, '2.6.2');

          expect(await resolveVersion(tool, '2.6', type)).toBe('2.6.2');
        });

        test('asks the registry without data', async () => {
          registry(tool, type, false, '3.0.0');

          expect(await resolveVersion(tool, 'latest', type)).toBe('3.0.0');
        });

        test('warns and keeps an exact version which needs a newer containerbase', async () => {
          await embed(tool, releases, [{ version: '2.5.0', cb: '15.0.0' }]);

          expect(await resolveVersion(tool, '2.5.0', type)).toBe('2.5.0');

          expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            `${tool} 2.5.0 needs containerbase 15.0.0 or newer, running 14.51.0, 2.5.0 is used as is`,
          );
        });

        test('warns and asks the registry when every match needs a newer containerbase', async () => {
          await embed(tool, releases, [{ version: '2.5.0', cb: '15.0.0' }]);
          registry(tool, type, true, '2.5.1');

          expect(await resolveVersion(tool, '2.5', type)).toBe('2.5.1');

          expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            `${tool} 2.5.1 needs containerbase 15.0.0 or newer, running 14.51.0, the own lookup of the tool is used`,
          );
        });

        test('never reads the data for install-gem and install-pip', async () => {
          await embed(tool, releases);
          const embedded = vi.spyOn(
            ToolVersionsService.prototype,
            'getVersions',
          );
          const online = vi.spyOn(
            ToolVersionsService.prototype,
            'getResolveVersions',
          );
          registry(tool, type, false, '2.6.0');

          expect(await resolveVersion(tool, 'latest', type, false)).toBe(
            '2.6.0',
          );

          expect(embedded).not.toHaveBeenCalled();
          expect(online).not.toHaveBeenCalled();
        });
      });

      /** LTS releases, newest first, like for node and java. */
      const ltsReleases = [
        { version: '25.0.0' },
        { version: '24.2.0', lts: true as const },
        { version: '22.1.0', lts: true as const },
      ];

      test.each([
        // an exact prerelease is kept
        { version: '27.0.0-alpha.0.0.0', expected: '27.0.0-alpha.0.0.0' },
        // the newest lts release, not the newer prerelease
        { version: 'latest', expected: '24.2.0' },
        { version: '26', expected: '26.1.0' },
      ])(
        'resolves node $version to $expected with a prerelease in the data',
        async ({ version, expected }) => {
          await fs.writeFile(
            `${dataDir}/v1/node.json`,
            JSON.stringify({
              tool: 'node',
              updatedAt: '2026-10-16T00:00:00Z',
              lts: true,
              versions: [
                { version: '27.0.0-alpha.0.0.0', prerelease: true },
                { version: '26.1.0' },
                { version: '24.2.0', lts: true },
              ],
            }),
          );

          // no interceptor, a request would fail the test
          expect(await resolveVersion('node', version)).toBe(expected);

          expect(logger.warn).not.toHaveBeenCalled();
        },
      );

      test.each([
        {
          tool: 'pnpm',
          type: 'npm' as const,
          extra: { type: 'npm', latest: '2.5.1' },
          versions: releases,
          expected: '2.5.1',
        },
        {
          tool: 'bundler',
          type: 'gem' as const,
          extra: {},
          versions: releases,
          expected: '2.5.1',
        },
        {
          tool: 'uv',
          type: 'pip' as const,
          extra: {},
          versions: releases,
          expected: '2.5.1',
        },
        {
          tool: 'yarn',
          type: undefined,
          extra: { type: 'npm', latest: '2.5.1' },
          versions: releases,
          expected: '2.5.1',
        },
        {
          tool: 'node',
          type: undefined,
          extra: { lts: true },
          versions: ltsReleases,
          expected: '24.2.0',
        },
        // composer is mocked here, php covers the prebuild resolver
        ...[
          'android-sdk-cmdline-tools',
          'cocoapods',
          'conan',
          'gradle',
          'maven',
          'mise',
          'nuget',
          'php',
        ].map((tool) => ({
          tool,
          type: undefined,
          extra: {},
          versions: releases,
          expected: '2.5.1',
        })),
        {
          tool: 'java',
          type: undefined,
          extra: { lts: true },
          versions: ltsReleases,
          expected: '24.2.0',
        },
      ])(
        'uses the embedded data of $tool with a warning when the online data is not available',
        async ({ tool, type, extra, versions, expected }) => {
          // outdated embedded data, so the online data is looked up
          await fs.rm(`${dataDir}/release.json`);
          await fs.writeFile(
            `${dataDir}/v1/${tool}.json`,
            JSON.stringify({
              tool,
              updatedAt: '2026-10-16T00:00:00Z',
              ...extra,
              versions,
            }),
          );
          scope('https://containerbase.github.io')
            .get(`/tool-versions/v1/${tool}.json`)
            .reply(404);

          // no own lookup interceptor, a request would fail the test
          expect(await resolveVersion(tool, 'latest', type)).toBe(expected);

          expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
            { tool, version: 'latest', resolved: expected },
            'online data not available (embedded, possibly outdated tool-versions data)',
          );
        },
      );

      describe('poetry', () => {
        const mirror = {
          info: {
            version: '0.6.1',
            requires_dist: ['poetry>=1.2.1,<2.0.0'],
          },
          releases: {},
        };

        /**
         * Embeds the poetry data with the tool-level `latest`, which the data
         * sets within the poetry-plugin-pypi-mirror range.
         */
        async function embedLatest(
          latest: string,
          versions: { version: string; deprecated?: true }[],
        ): Promise<void> {
          await fs.writeFile(
            `${dataDir}/v1/poetry.json`,
            JSON.stringify({
              tool: 'poetry',
              updatedAt: '2026-10-16T00:00:00Z',
              latest,
              versions,
            }),
          );
        }

        test('resolves latest to the tool-level latest of the data', async () => {
          await embedLatest('1.8.3', [
            { version: '2.0.0' },
            { version: '1.8.4', deprecated: true },
            { version: '1.8.3' },
          ]);

          // no interceptor, a request would fail the test
          expect(await resolveVersion('poetry', 'latest', 'pip')).toBe('1.8.3');
        });

        test('asks pypi with the mirror plugin range when the data has no tool-level latest', async () => {
          await embed('poetry', [{ version: '2.0.0' }]);
          scope('https://pypi.org')
            .get('/pypi/poetry-plugin-pypi-mirror/json')
            .reply(200, mirror)
            .get('/pypi/poetry/json')
            .reply(200, {
              info: { version: '2.0.0' },
              releases: {
                '1.8.5': [{ packagetype: 'sdist', yanked: false }],
                '2.0.0': [{ packagetype: 'sdist', yanked: false }],
              },
            });

          expect(await resolveVersion('poetry', 'latest', 'pip')).toBe('1.8.5');
        });

        test('resolves a partial version from the data without the mirror plugin', async () => {
          await embedLatest('1.8.3', [
            { version: '2.0.0' },
            { version: '1.8.3' },
          ]);

          // no interceptor, a request would fail the test
          expect(await resolveVersion('poetry', '2', 'pip')).toBe('2.0.0');
        });
      });
    });
  });

  describe('linkTool', () => {
    test('without ipc server', async () => {
      const spy = vi.spyOn(fs, 'writeFile');
      expect(await linkTool('node', { srcDir: '/bin/bash' })).toBe(0);
      expect(spy).toHaveBeenCalledOnce();
      expect(logger.debug).toHaveBeenCalledWith(
        'ipc server not running, linking tool directly',
      );
      expect(await pathExists(rootPath('tmp/containerbase/ipc.sock'))).toBe(
        false,
      );
    });

    test('fails when the bin folder is not writable', async () => {
      const pathSvc = await createContainer().getAsync(PathService);
      failAccess(pathSvc.binDir, 'EROFS');
      const spy = vi.spyOn(fs, 'writeFile');

      await expect(linkTool('node', { srcDir: '/bin/bash' })).rejects.toThrow(
        `EROFS: can't write to ${pathSvc.binDir}, the file system is read-only. Install tools at image build time or mount the containerbase folders writable.`,
      );

      expect(spy).not.toHaveBeenCalled();
    });

    test('checks only the bin folder', async () => {
      const pathSvc = await createContainer().getAsync(PathService);
      failAccess(pathSvc.dataPath, 'EROFS');

      expect(await linkTool('node', { srcDir: '/bin/bash' })).toBe(0);
    });

    test('with ipc server', async () => {
      const svr = await createContainer().getAsync(IpcServer);
      await svr.start();
      expect(await pathExists(rootPath('tmp/containerbase/ipc.sock'))).toBe(
        true,
      );
      try {
        const spy = vi.spyOn(fs, 'writeFile');
        // the running install has checked the folders already
        const access = vi.spyOn(fs, 'access');
        const pathSvc = await createContainer().getAsync(PathService);
        expect(await linkTool('node', { srcDir: '/bin/bash' })).toBe(0);
        expect(spy).toHaveBeenCalledOnce();
        expect(access).not.toHaveBeenCalledWith(
          pathSvc.binDir,
          fs.constants.W_OK,
        );
        expect(logger.debug).toHaveBeenCalledWith(
          'ipc server found, linking tool via ipc',
        );
      } finally {
        svr.stop();
      }
      expect(await pathExists(rootPath('tmp/containerbase/ipc.sock'))).toBe(
        false,
      );
    });
  });

  describe('uninstallTool', () => {
    test('fails first when the folders are not writable', async () => {
      const pathSvc = await createContainer().getAsync(PathService);
      failAccess(pathSvc.binDir, 'EACCES');
      const spy = vi.spyOn(VersionService.prototype, 'getTypes');

      await expect(
        uninstallTool({ tool: 'node', version: '1.0.0' }),
      ).rejects.toThrow(
        `EACCES: can't write to ${pathSvc.binDir}, the current user has no write permission. Run as root or as the user owning the folder.`,
      );

      expect(spy).not.toHaveBeenCalled();
    });

    test('skips the writable check for a dry run', async () => {
      const pathSvc = await createContainer().getAsync(PathService);
      failAccess(pathSvc.binDir, 'EROFS');

      expect(
        await uninstallTool({ tool: 'bun', version: '9.9.9', dryRun: true }),
      ).toBeUndefined();
    });

    test('works', async () => {
      // not installed
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0' }),
      ).toBeUndefined();
      // legacy not supported
      expect(await uninstallTool({ tool: 'leg', version: '1.0.0' })).toBe(
        NotSupported,
      );
      // linked tool uninstall supported
      expect(await installTool('bun', '2.0.0')).toBeUndefined();
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0' }),
      ).toBeUndefined();

      // can uninstall old version
      expect(await installTool('bun', '2.0.1')).toBeUndefined();
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0', dryRun: true }),
      ).toBeUndefined();
      expect(
        await uninstallTool({ tool: 'bun', version: '2.0.0' }),
      ).toBeUndefined();

      // cannot uninstall if has childs
      expect(await uninstallTool({ tool: 'node', version: '1.0.1' })).toBe(
        BlockingChild,
      );
    });

    test.each([
      { type: 'gem' as const },
      { type: 'npm' as const },
      { type: 'pip' as const },
    ])('works: $type', async ({ type }) => {
      expect(
        await uninstallTool({
          tool: `dummy-${type}`,
          version: '2.0.0',
          dryRun: false,
          type,
        }),
      ).toBeUndefined();
    });
  });
});
