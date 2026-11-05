import fs from 'node:fs/promises';
import { arch } from 'node:os';
import path from 'node:path';
import {
  type MockInstance,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import type { ToolVersions } from '../../../../packages/base/src/tool-versions-types.ts';
import {
  CompressionService,
  EnvService,
  LinkToolService,
  PathService,
  ToolVersionResolverService,
  ToolVersionsService,
} from '../../services/index.ts';
import { bindVersionResolvers } from '../version-resolvers.ts';
import { blockedCerts } from './blocked-certs.ts';
import {
  JavaInstallService,
  JavaJdkInstallService,
  JavaJreInstallService,
  JavaJrePrepareService,
  JavaPrepareService,
} from './index.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const apiUrl = 'https://api.adoptium.net';
const cdnUrl = 'https://cdn.example.com';
const tarball = 'java archive';

/** The Adoptium package metadata of a release asset. */
function javaPackage(name: string): {
  checksum: string;
  link: string;
  name: string;
} {
  return {
    checksum: checksum(tarball),
    link: `${cdnUrl}/${name}`,
    name,
  };
}

describe('cli/tools/java/index', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'usr/local/etc',
      'opt/containerbase/bin',
      'opt/containerbase/ssl',
      'var/lib/containerbase',
    ]);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
    // no tool-versions data, the adoptium API lists the package
    mockToolFiles();
  });

  describe('JavaInstallService', () => {
    test.each([
      // a version per row, as the download cache is keyed by the url
      { Svc: JavaInstallService, type: 'jdk', patch: '5' },
      { Svc: JavaJdkInstallService, type: 'jdk', patch: '6' },
      { Svc: JavaJreInstallService, type: 'jre', patch: '7' },
    ])(
      'install: downloads the $type from the tool-versions data of $Svc.name',
      async ({ Svc, type, patch }) => {
        const version = `21.0.${patch}+11`;
        const name = `OpenJDK21U-${type}_x64_linux_hotspot_21.0.${patch}_11.tar.gz`;
        const files = mockToolFiles([
          toolFile(`${cdnUrl}/${name}`, tarball, 'amd64'),
          toolFile(`${cdnUrl}/arm64-${name}`, tarball, 'arm64'),
        ]);
        // no interceptor for the adoptium API
        scope(cdnUrl).get(`/${name}`).reply(200, tarball);
        const extract = vi
          .spyOn(CompressionService.prototype, 'extract')
          .mockImplementation(async ({ cwd }) => {
            await fs.mkdir(path.join(cwd, 'lib/security'), {
              recursive: true,
            });
            await fs.writeFile(path.join(cwd, 'lib/security/cacerts'), 'certs');
          });
        const { svc, pathSvc } = await toolContext(Svc);

        await expect(svc.install(version)).resolves.toBeUndefined();

        // the data of `java` lists the jdk, like `java-jdk`
        expect(files).toHaveBeenCalledWith(svc.name, version);
        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(name),
          cwd: pathSvc.versionedToolPath(svc.name, version),
          strip: 1,
        });
      },
    );

    test('install links the shared cert store', async () => {
      const { svc, pathSvc } = await toolContext(JavaInstallService);
      const pkg = javaPackage('OpenJDK21U-jdk_x64_linux_hotspot.tar.gz');
      scope(apiUrl)
        .get('/v3/assets/version/21.0.4+7')
        .query(true)
        .reply(200, [{ binaries: [{ package: pkg }] }]);
      scope(cdnUrl).get(`/${pkg.name}`).reply(200, tarball);
      const extract = vi
        .spyOn(CompressionService.prototype, 'extract')
        .mockImplementation(async ({ cwd }) => {
          await fs.mkdir(path.join(cwd, 'lib/security'), { recursive: true });
          await fs.writeFile(path.join(cwd, 'lib/security/cacerts'), 'certs');
          await fs.writeFile(
            path.join(cwd, 'lib/security/blocked.certs'),
            'Algorithm=SHA-256\n',
          );
        });

      await expect(svc.install('21.0.4+7')).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledOnce();
      const cwd = pathSvc.versionedToolPath('java', '21.0.4+7');
      expect(await fs.readlink(path.join(cwd, 'lib/security/cacerts'))).toBe(
        path.join(pathSvc.sslPath, 'cacerts'),
      );
      expect(
        await fs.readFile(path.join(cwd, 'lib/security/blocked.certs'), 'utf8'),
      ).toBe(`Algorithm=SHA-256\n${blockedCerts.join('\n')}\n`);
    });

    test('install: java 8 jdk keeps the cert store under jre', async () => {
      const { svc, pathSvc } = await toolContext(JavaJdkInstallService);
      const pkg = javaPackage('OpenJDK8U-jdk_x64_linux_hotspot.tar.gz');
      scope(apiUrl)
        .get('/v3/assets/version/8.0.422+5')
        .query(true)
        .reply(200, [{ binaries: [{ package: pkg }] }]);
      scope(cdnUrl).get(`/${pkg.name}`).reply(200, tarball);
      vi.spyOn(CompressionService.prototype, 'extract').mockImplementation(
        async ({ cwd }) => {
          await fs.mkdir(path.join(cwd, 'jre/lib/security'), {
            recursive: true,
          });
          await fs.writeFile(
            path.join(cwd, 'jre/lib/security/cacerts'),
            'certs',
          );
          await fs.writeFile(
            path.join(cwd, 'jre/lib/security/blacklisted.certs'),
            'Algorithm=SHA-256\n',
          );
        },
      );

      await expect(svc.install('8.0.422+5')).resolves.toBeUndefined();

      const cwd = pathSvc.versionedToolPath('java-jdk', '8.0.422+5');
      expect(
        await fs.readlink(path.join(cwd, 'jre/lib/security/cacerts')),
      ).toBe(path.join(pathSvc.sslPath, 'cacerts'));
      expect(
        await fs.readFile(
          path.join(cwd, 'jre/lib/security/blacklisted.certs'),
          'utf8',
        ),
      ).toBe(`Algorithm=SHA-256\n${blockedCerts.join('\n')}\n`);
    });

    test('install: java 8 jre keeps the default cert store location', async () => {
      const { svc, pathSvc } = await toolContext(JavaJreInstallService);
      const pkg = javaPackage('OpenJDK8U-jre_x64_linux_hotspot.tar.gz');
      scope(apiUrl)
        .get('/v3/assets/version/8.0.422+6')
        .query(true)
        .reply(200, [{ binaries: [{ package: pkg }] }]);
      scope(cdnUrl).get(`/${pkg.name}`).reply(200, tarball);
      vi.spyOn(CompressionService.prototype, 'extract').mockImplementation(
        async ({ cwd }) => {
          await fs.mkdir(path.join(cwd, 'lib/security'), { recursive: true });
          await fs.writeFile(path.join(cwd, 'lib/security/cacerts'), 'certs');
        },
      );

      expect(svc.alias).toBe('java');
      await expect(svc.install('8.0.422+6')).resolves.toBeUndefined();

      const cwd = pathSvc.versionedToolPath('java-jre', '8.0.422+6');
      expect(await fs.readlink(path.join(cwd, 'lib/security/cacerts'))).toBe(
        path.join(pathSvc.sslPath, 'cacerts'),
      );
    });

    test('install: throws without a download url', async () => {
      const { svc } = await toolContext(JavaInstallService);
      scope(apiUrl)
        .get('/v3/assets/version/99.0.0')
        .query(true)
        .reply(200, [{ binaries: [] }]);

      await expect(svc.install('99.0.0')).rejects.toThrow(
        'Could not resolve download url for java 99.0.0 and type jdk',
      );
    });

    test('isPrepared', async () => {
      const { svc, pathSvc } = await toolContext(JavaInstallService);
      const cacerts = path.join(pathSvc.sslPath, 'cacerts');
      await fs.rm(cacerts, { force: true });

      expect(await svc.isPrepared()).toBe(false);

      await fs.writeFile(cacerts, 'certs');
      expect(await svc.isPrepared()).toBe(true);
      await fs.rm(cacerts, { force: true });
    });

    test('link and alias', async () => {
      const { svc, pathSvc } = await toolContext(JavaJdkInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      expect(svc.alias).toBe('java');
      await expect(svc.link('21.0.4+7')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('java-jdk', {
        srcDir: path.join(
          pathSvc.versionedToolPath('java-jdk', '21.0.4+7'),
          'bin',
        ),
        name: 'java',
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(JavaInstallService);

      await expect(svc.test('21.0.4+7')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'java',
        ['-version'],
        expect.any(Object),
      );
    });
  });

  describe('JavaPrepareService', () => {
    /**
     * Creates the prepare service with the version resolvers bound, and
     * removes the cert store and the links of a previous prepare.
     */
    async function prepareContext(
      Svc: typeof JavaPrepareService,
    ): Promise<{ svc: JavaPrepareService; pathSvc: PathService }> {
      const child = await testContainer();
      bindVersionResolvers(child);
      child.bind(Svc).toSelf();
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);
      await fs.rm(path.join(pathSvc.sslPath, 'cacerts'), { force: true });
      for (const dir of ['.m2', '.gradle', '.android', '.android-sdk']) {
        await fs.rm(path.join(envSvc.userHome, dir), { force: true });
      }
      return { svc: await child.getAsync(Svc), pathSvc };
    }

    /**
     * Mocks the embedded and the online java-jre data, with `21.0.4+7` as the
     * newest lts release.
     * @returns the spy of the online lookups
     */
    function mockJreData(): MockInstance<
      ToolVersionsService['getResolveVersions']
    > {
      const data: ToolVersions = {
        tool: 'java-jre',
        updatedAt: '2026-11-01T00:00:00Z',
        lts: true,
        versions: [{ version: '22.0.2+9' }, { version: '21.0.4+7', lts: true }],
      };
      vi.spyOn(ToolVersionsService.prototype, 'getVersions').mockResolvedValue(
        data,
      );
      return vi
        .spyOn(ToolVersionsService.prototype, 'getResolveVersions')
        .mockResolvedValue({ data, source: 'online' });
    }

    test('initialize', async () => {
      const { svc, pathSvc } = await prepareContext(JavaPrepareService);

      await expect(svc.initialize()).resolves.toBeUndefined();

      expect(
        (await fs.stat(path.join(pathSvc.cachePath, '.android'))).isDirectory(),
      ).toBe(true);
      expect(
        await fs.readFile(
          path.join(pathSvc.toolPath('gradle'), 'env.sh'),
          'utf8',
        ),
      ).toContain('GRADLE_USER_HOME');

      // a second run keeps the gradle tool env
      await expect(svc.initialize()).resolves.toBeUndefined();
    });

    test('prepare downloads the cert store from the tool-versions data', async () => {
      const { svc, pathSvc } = await prepareContext(JavaJrePrepareService);
      const name = 'OpenJDK21U-jre_x64_linux_hotspot_21.0.4_7.tar.gz';
      const data = mockJreData();
      const files = mockToolFiles([
        toolFile(`${cdnUrl}/${name}`, tarball, 'amd64'),
        toolFile(`${cdnUrl}/arm64-${name}`, tarball, 'arm64'),
      ]);
      // no interceptor for the adoptium API
      scope(cdnUrl).get(`/${name}`).reply(200, tarball);
      const extract = vi
        .spyOn(CompressionService.prototype, 'extract')
        .mockImplementation(async ({ cwd }) => {
          await fs.mkdir(path.join(cwd, 'lib/security'), { recursive: true });
          await fs.writeFile(path.join(cwd, 'lib/security/cacerts'), 'certs');
        });

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(data).toHaveBeenCalledWith('java-jre');
      expect(files).toHaveBeenCalledExactlyOnceWith('java-jre', '21.0.4+7');
      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(name),
        cwd: expect.any(String),
        strip: 1,
      });
      expect(await fs.readlink(path.join(pathSvc.sslPath, 'cacerts'))).toBe(
        path.join(pathSvc.varPath, 'cacerts'),
      );

      // the cert store is only set up once
      await expect(svc.prepare()).resolves.toBeUndefined();
      expect(extract).toHaveBeenCalledOnce();
    });

    test('prepare: throws without a jre version', async () => {
      const { svc } = await prepareContext(JavaPrepareService);
      const resolve = vi
        .spyOn(ToolVersionResolverService.prototype, 'resolve')
        .mockResolvedValue(undefined);

      await expect(svc.prepare()).rejects.toThrow(
        'Could not resolve the latest java-jre version',
      );
      expect(resolve).toHaveBeenCalledExactlyOnceWith('java-jre', undefined);
    });

    test('prepare: throws without a jre file in the tool-versions data', async () => {
      const { svc } = await prepareContext(JavaPrepareService);
      mockJreData();
      mockToolFiles([toolFile(`${cdnUrl}/arm64-jre.tar.gz`, tarball, 'arm64')]);

      await expect(svc.prepare()).rejects.toThrow(
        'Could not find a java-jre 21.0.4+7 file in the tool-versions data',
      );
    });
  });
});
