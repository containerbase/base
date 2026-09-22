import fs from 'node:fs/promises';
import { arch } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
  PathService,
} from '../../services/index.ts';
import {
  JavaInstallService,
  JavaJdkInstallService,
  JavaJreInstallService,
  JavaJrePrepareService,
  JavaPrepareService,
} from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

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
  });

  describe('JavaInstallService', () => {
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
        });

      await expect(svc.install('21.0.4+7')).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledOnce();
      const cwd = pathSvc.versionedToolPath('java', '21.0.4+7');
      expect(await fs.readlink(path.join(cwd, 'lib/security/cacerts'))).toBe(
        path.join(pathSvc.sslPath, 'cacerts'),
      );
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
        },
      );

      await expect(svc.install('8.0.422+5')).resolves.toBeUndefined();

      const cwd = pathSvc.versionedToolPath('java-jdk', '8.0.422+5');
      expect(
        await fs.readlink(path.join(cwd, 'jre/lib/security/cacerts')),
      ).toBe(path.join(pathSvc.sslPath, 'cacerts'));
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
    test('initialize', async () => {
      const { svc, child } = await toolContext(JavaPrepareService);
      const pathSvc = await child.getAsync(PathService);

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

    test('prepare downloads the cert store', async () => {
      const { svc, child } = await toolContext(JavaJrePrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);
      const pkg = javaPackage('OpenJDK21U-jre_x64_linux_hotspot.tar.gz');
      scope(apiUrl)
        .get('/v3/info/release_versions')
        .query(true)
        .reply(200, { versions: [{ semver: '21.0.4+7' }] })
        .get('/v3/assets/version/21.0.4+7')
        .query(true)
        .reply(200, [{ binaries: [{ package: pkg }] }]);
      scope(cdnUrl).get(`/${pkg.name}`).reply(200, tarball);
      vi.spyOn(CompressionService.prototype, 'extract').mockImplementation(
        async ({ cwd }) => {
          await fs.mkdir(path.join(cwd, 'lib/security'), { recursive: true });
          await fs.writeFile(path.join(cwd, 'lib/security/cacerts'), 'certs');
        },
      );

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(path.join(pathSvc.sslPath, 'cacerts'))).toBe(
        path.join(pathSvc.varPath, 'cacerts'),
      );
      expect(await fs.readlink(path.join(envSvc.userHome, '.m2'))).toBe(
        path.join(pathSvc.cachePath, '.m2'),
      );

      // the cert store is only set up once
      await expect(svc.prepare()).resolves.toBeUndefined();
    });

    test('prepare: throws on an empty version', async () => {
      const { svc, child } = await toolContext(JavaPrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);
      await fs.rm(path.join(pathSvc.sslPath, 'cacerts'), { force: true });
      for (const dir of ['.m2', '.gradle', '.android', '.android-sdk']) {
        await fs.rm(path.join(envSvc.userHome, dir), { force: true });
      }
      // the schema accepts any string, so an empty semver reaches the guard
      scope(apiUrl)
        .get('/v3/info/release_versions')
        .query(true)
        .reply(200, { versions: [{ semver: '' }] });

      await expect(svc.prepare()).rejects.toThrow(
        'Could not resolve latest java version',
      );
    });

    test('prepare: throws without a download url', async () => {
      const { svc, child } = await toolContext(JavaPrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);
      await fs.rm(path.join(pathSvc.sslPath, 'cacerts'), { force: true });
      for (const dir of ['.m2', '.gradle', '.android', '.android-sdk']) {
        await fs.rm(path.join(envSvc.userHome, dir), { force: true });
      }
      scope(apiUrl)
        .get('/v3/info/release_versions')
        .query(true)
        .reply(200, { versions: [{ semver: '21.0.4+7' }] })
        .get('/v3/assets/version/21.0.4+7')
        .query(true)
        .reply(200, [{ binaries: [] }]);

      await expect(svc.prepare()).rejects.toThrow(
        'Could not resolve download url for java 21.0.4+7',
      );
    });
  });
});
