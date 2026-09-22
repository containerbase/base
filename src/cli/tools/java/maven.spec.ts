import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import { MavenInstallService, MavenVersionResolver } from './maven.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const ghUrl = 'https://github.com';
const repoUrl = 'https://repo.maven.apache.org';
const tarball = 'maven archive';

describe('cli/tools/java/maven', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  test('install: from the containerbase prebuild', async () => {
    const { svc, pathSvc } = await toolContext(MavenInstallService);
    const filename = 'maven-3.9.9.tar.xz';
    const releaseUrl = `/containerbase/maven-prebuild/releases/download/3.9.9`;
    scope(ghUrl)
      .head(`${releaseUrl}/${filename}.sha512`)
      .reply(200)
      .get(`${releaseUrl}/${filename}.sha512`)
      .reply(200, `${checksum(tarball, 'sha512')}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install('3.9.9')).resolves.toBeUndefined();

    expect(logger.info).toHaveBeenCalledWith('using github');
    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.toolPath('maven'),
      strip: undefined,
    });
  });

  test('install: falls back to maven central with a sha512', async () => {
    const { svc, pathSvc } = await toolContext(MavenInstallService);
    const filename = 'apache-maven-3.9.8-bin.tar.gz';
    const path = `/maven2/org/apache/maven/apache-maven/3.9.8/${filename}`;
    scope(ghUrl)
      .head(
        '/containerbase/maven-prebuild/releases/download/3.9.8/maven-3.9.8.tar.xz.sha512',
      )
      .reply(404);
    scope(repoUrl)
      .head(`${path}.sha512`)
      .reply(200)
      .get(`${path}.sha512`)
      .reply(200, `${checksum(tarball, 'sha512')}\n`)
      .get(path)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install('3.9.8')).resolves.toBeUndefined();

    expect(logger.info).toHaveBeenCalledWith('using repo.maven.apache.org');
    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('maven', '3.9.8'),
      strip: 1,
    });
  });

  test('install: falls back to a sha1 checksum', async () => {
    const { svc } = await toolContext(MavenInstallService);
    const filename = 'apache-maven-3.8.8-bin.tar.gz';
    const path = `/maven2/org/apache/maven/apache-maven/3.8.8/${filename}`;
    scope(ghUrl)
      .head(
        '/containerbase/maven-prebuild/releases/download/3.8.8/maven-3.8.8.tar.xz.sha512',
      )
      .reply(404);
    scope(repoUrl)
      .head(`${path}.sha512`)
      .reply(404)
      .head(`${path}.sha1`)
      .reply(200)
      .get(`${path}.sha1`)
      .reply(200, `${checksum(tarball, 'sha1')}\n`)
      .get(path)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install('3.8.8')).resolves.toBeUndefined();

    expect(logger.debug).toHaveBeenCalledWith(
      `using sha1 checksum for ${filename}`,
    );
    expect(extract).toHaveBeenCalledOnce();
  });

  test('install: throws on an empty checksum file', async () => {
    const { svc } = await toolContext(MavenInstallService);
    const filename = 'apache-maven-3.8.9-bin.tar.gz';
    const path = `/maven2/org/apache/maven/apache-maven/3.8.9/${filename}`;
    scope(ghUrl)
      .head(
        '/containerbase/maven-prebuild/releases/download/3.8.9/maven-3.8.9.tar.xz.sha512',
      )
      .reply(404);
    scope(repoUrl)
      .head(`${path}.sha512`)
      .reply(200)
      .get(`${path}.sha512`)
      .reply(200, '   \n');

    await expect(svc.install('3.8.9')).rejects.toThrow(
      `checksum not found for ${filename}`,
    );
  });

  test('install: throws without any checksum', async () => {
    const { svc } = await toolContext(MavenInstallService);
    const filename = 'apache-maven-3.8.7-bin.tar.gz';
    const path = `/maven2/org/apache/maven/apache-maven/3.8.7/${filename}`;
    scope(ghUrl)
      .head(
        '/containerbase/maven-prebuild/releases/download/3.8.7/maven-3.8.7.tar.xz.sha512',
      )
      .reply(404);
    scope(repoUrl)
      .head(`${path}.sha512`)
      .reply(404)
      .head(`${path}.sha1`)
      .reply(404);

    await expect(svc.install('3.8.7')).rejects.toThrow(
      `checksum file not found for ${filename}`,
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(MavenInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('3.9.9')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('maven', {
      srcDir: join(pathSvc.versionedToolPath('maven', '3.9.9'), 'bin'),
      name: 'mvn',
      extraToolEnvs: ['java'],
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(MavenInstallService);

    await expect(svc.test('3.9.9')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'mvn',
      ['--version'],
      expect.any(Object),
    );
  });

  describe('MavenVersionResolver', () => {
    test.each([{ version: undefined }, { version: '' }, { version: 'latest' }])(
      'resolves $version',
      async ({ version }) => {
        scope(ghUrl)
          .get('/containerbase/maven-prebuild/releases/latest/download/version')
          .reply(200, '3.9.9');
        const { svc } = await toolContext(MavenVersionResolver);

        expect(await svc.resolve(version)).toBe('3.9.9');
      },
    );

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(MavenVersionResolver);

      expect(await svc.resolve('3.9.9')).toBe('3.9.9');
    });
  });
});
