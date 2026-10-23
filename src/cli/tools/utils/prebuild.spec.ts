import { createHash } from 'node:crypto';
import { arch } from 'node:os';
import { join } from 'node:path';
import { type Container, injectFromHierarchy, injectable } from 'inversify';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { VersionFiles } from '../../../../packages/base/src/tool-versions-types.ts';
import {
  CompressionService,
  HttpService,
  LinkToolService,
  PathService,
  ToolVersionsService,
  lookupOptions,
} from '../../services/index.ts';
import { getDistro, logger } from '../../utils/index.ts';
import { PrebuildInstallService, PrebuildVersionResolver } from './prebuild.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const baseUrl = 'https://github.com';
const tarball = 'prebuilt tool';
const checksum = createHash('sha512').update(tarball).digest('hex');

@injectable()
@injectFromHierarchy()
class ErlangInstallService extends PrebuildInstallService {
  readonly name = 'erlang';
}

@injectable()
@injectFromHierarchy()
class ErlangVersionResolver extends PrebuildVersionResolver {
  readonly tool = 'erlang';
}

/** The download path of an erlang prebuild. */
function releasePath(version: string, code: string, ghArch: string): string {
  return `/containerbase/erlang-prebuild/releases/download/${version}/erlang-${version}-${code}-${ghArch}.tar.xz`;
}

describe('cli/tools/utils/prebuild', () => {
  let child!: Container;
  let pathSvc!: PathService;

  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'opt/containerbase/bin',
      'opt/containerbase/tools',
    ]);
  });

  beforeEach(async () => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'jammy',
      versionId: '22.04',
    });
    child = await testContainer();
    child.bind(ErlangInstallService).toSelf();
    child.bind(ErlangVersionResolver).toSelf();
    pathSvc = await child.getAsync(PathService);
    // no tool-versions data, the prebuild is downloaded from its release
    vi.spyOn(
      ToolVersionsService.prototype,
      'getVersionFiles',
    ).mockResolvedValue(undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('PrebuildInstallService', () => {
    test('install: verified against the checksum', async () => {
      const path = releasePath('26.0.0', 'jammy', 'x86_64');
      scope(baseUrl)
        .get(`${path}.sha512`)
        .reply(200, `${checksum}\n`)
        .get(path)
        .reply(200, tarball);
      const spy = vi.spyOn(CompressionService.prototype, 'extract');
      const svc = await child.getAsync(ErlangInstallService);

      await expect(svc.install('26.0.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining('erlang-26.0.0-jammy-x86_64.tar.xz'),
        cwd: pathSvc.toolPath('erlang'),
      });
    });

    test.each([{ code: 'noble' }, { code: 'resolute' }])(
      'install: uses the jammy prebuild on $code',
      async ({ code }) => {
        vi.mocked(getDistro).mockResolvedValue({
          name: 'Ubuntu',
          versionCode: code,
          versionId: '24.04',
        });
        const version = `27.0.0-${code}`;
        const path = releasePath(version, 'jammy', 'x86_64');
        scope(baseUrl)
          .get(`${path}.sha512`)
          .reply(200, checksum)
          .get(path)
          .reply(200, tarball);
        const svc = await child.getAsync(ErlangInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(logger.debug).toHaveBeenCalledWith(
          `Using jammy prebuild for erlang on ${code}`,
        );
      },
    );

    test('install: on arm64', async () => {
      vi.mocked(arch).mockReturnValue('arm64');
      const path = releasePath('28.0.0', 'jammy', 'aarch64');
      scope(baseUrl)
        .get(`${path}.sha512`)
        .reply(200, checksum)
        .get(path)
        .reply(200, tarball);
      const arm = await testContainer();
      arm.bind(ErlangInstallService).toSelf();
      const svc = await arm.getAsync(ErlangInstallService);

      await expect(svc.install('28.0.0')).resolves.toBeUndefined();
    });

    describe('with tool-versions data', () => {
      /** The files of an erlang version, as tool-versions publishes them. */
      function versionFiles(
        version: string,
        distros: string[] = ['jammy'],
      ): VersionFiles {
        return {
          tool: 'erlang',
          version,
          files: distros.flatMap((distro) =>
            ['aarch64', 'x86_64'].map((ghArch) => ({
              name: `erlang-${version}-${distro}-${ghArch}.tar.xz`,
              url: `${baseUrl}${releasePath(version, distro, ghArch)}`,
              checksum: `sha512:${checksum}`,
              arch: ghArch === 'x86_64' ? 'amd64' : 'arm64',
              distro,
            })),
          ),
        };
      }

      test.each([
        { code: 'jammy', distros: ['jammy'], file: 'jammy', lookups: 1 },
        {
          code: 'noble',
          distros: ['jammy', 'noble'],
          file: 'noble',
          lookups: 1,
        },
        { code: 'noble', distros: ['jammy'], file: 'jammy', lookups: 2 },
        { code: 'resolute', distros: ['jammy'], file: 'jammy', lookups: 2 },
      ])(
        'install: downloads the $file file of $distros on $code without the .sha512',
        async ({ code, distros, file, lookups }) => {
          vi.mocked(getDistro).mockResolvedValue({
            name: 'Ubuntu',
            versionCode: code,
            versionId: '24.04',
          });
          const version = `29.0.0-${code}-${distros.length}`;
          const files = vi
            .spyOn(ToolVersionsService.prototype, 'getVersionFiles')
            .mockResolvedValue(versionFiles(version, distros));
          // there is no interceptor for the `.sha512`
          scope(baseUrl)
            .get(releasePath(version, file, 'x86_64'))
            .reply(200, tarball);
          const spy = vi.spyOn(CompressionService.prototype, 'extract');
          const svc = await child.getAsync(ErlangInstallService);

          await expect(svc.install(version)).resolves.toBeUndefined();

          expect(files).toHaveBeenCalledTimes(lookups);
          expect(files).toHaveBeenCalledWith('erlang', version);
          expect(spy).toHaveBeenCalledExactlyOnceWith({
            file: expect.stringContaining(
              `erlang-${version}-${file}-x86_64.tar.xz`,
            ),
            cwd: pathSvc.toolPath('erlang'),
          });
        },
      );

      test.each([
        { code: 'jammy', lookups: 1 },
        { code: 'noble', lookups: 2 },
      ])(
        'install: falls back to the release on $code without a file for the host',
        async ({ code, lookups }) => {
          vi.mocked(getDistro).mockResolvedValue({
            name: 'Ubuntu',
            versionCode: code,
            versionId: '24.04',
          });
          const version = `29.1.0-${code}`;
          const data = versionFiles(version);
          const files = vi
            .spyOn(ToolVersionsService.prototype, 'getVersionFiles')
            .mockResolvedValue({
              ...data,
              files: data.files.filter((f) => f.arch === 'arm64'),
            });
          const path = releasePath(version, 'jammy', 'x86_64');
          scope(baseUrl)
            .get(`${path}.sha512`)
            .reply(200, checksum)
            .get(path)
            .reply(200, tarball);
          const svc = await child.getAsync(ErlangInstallService);

          await expect(svc.install(version)).resolves.toBeUndefined();

          expect(files).toHaveBeenCalledTimes(lookups);
        },
      );
    });

    test('link', async () => {
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const svc = await child.getAsync(ErlangInstallService);

      await expect(svc.link('26.0.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('erlang', {
        srcDir: join(pathSvc.versionedToolPath('erlang', '26.0.0'), 'bin'),
      });
    });

    test('runs the tool test', async () => {
      const svc = await child.getAsync(ErlangInstallService);

      await expect(svc.test('26.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'erlang',
        ['--version'],
        expect.any(Object),
      );
    });
  });

  describe('PrebuildVersionResolver', () => {
    test.each([{ version: undefined }, { version: '' }, { version: 'latest' }])(
      'resolves $version',
      async ({ version }) => {
        scope(baseUrl)
          .get(
            '/containerbase/erlang-prebuild/releases/latest/download/version',
          )
          .reply(200, '26.2.5');
        const resolver = await child.getAsync(ErlangVersionResolver);

        expect(await resolver.resolve(version)).toBe('26.2.5');
      },
    );

    test('looks up with the lookup timeouts', async () => {
      const spy = vi.spyOn(HttpService.prototype, 'get');
      scope(baseUrl)
        .get('/containerbase/erlang-prebuild/releases/latest/download/version')
        .reply(200, '26.2.5');
      const resolver = await child.getAsync(ErlangVersionResolver);

      await resolver.resolve('latest');

      expect(spy).toHaveBeenCalledExactlyOnceWith(
        `${baseUrl}/containerbase/erlang-prebuild/releases/latest/download/version`,
        lookupOptions,
      );
    });

    test('keeps a pinned version', async () => {
      const resolver = await child.getAsync(ErlangVersionResolver);

      expect(await resolver.resolve('26.0.0')).toBe('26.0.0');
    });
  });
});
