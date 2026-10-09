import { join } from 'node:path';
import { codeBlock } from 'common-tags';
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

  test('install: falls back to maven central for a two-part version', async () => {
    const { svc } = await toolContext(MavenInstallService);
    const filename = 'apache-maven-3.0-bin.tar.gz';
    const path = `/maven2/org/apache/maven/apache-maven/3.0/${filename}`;
    scope(ghUrl)
      .head(
        '/containerbase/maven-prebuild/releases/download/3.0/maven-3.0.tar.xz.sha512',
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

    await expect(svc.install('3.0')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: expect.stringContaining('3.0'),
      strip: 1,
    });
  });

  test.each([
    { version: '3.9.9', valid: true },
    { version: '3.1.0-alpha-1', valid: true },
    { version: '3.0', valid: true },
    { version: '3', valid: false },
    { version: '3.0.', valid: false },
    { version: 'latest', valid: false },
  ])('validate: $version is $valid', async ({ version, valid }) => {
    const { svc } = await toolContext(MavenInstallService);

    await expect(svc.validate(version)).resolves.toBe(valid);
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
      `Checksum not found in ${repoUrl}${path}.sha512`,
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

    describe('partial versions', () => {
      const metadataPath =
        '/maven2/org/apache/maven/apache-maven/maven-metadata.xml';
      const metadata = codeBlock`
        <?xml version="1.0" encoding="UTF-8"?>
        <metadata>
          <groupId>org.apache.maven</groupId>
          <artifactId>apache-maven</artifactId>
          <versioning>
            <latest>4.0.0-rc-1</latest>
            <release>3.9.9</release>
            <versions>
              <version>3.8.8</version>
              <version>3.9.0</version>
              <version>3.9.10</version>
              <version>3.9.9</version>
              <version>3.10.0</version>
              <version>3.9</version>
              <version>4.0.0-alpha-1</version>
              <version>4.0.0-beta-1</version>
              <version>4.0.0-rc-1</version>
              <version>5.0.0-M1</version>
              <version>30.1.0</version>
            </versions>
          </versioning>
        </metadata>
      `;

      test.each([
        { version: '3', expected: '3.10.0' },
        { version: '3.9', expected: '3.9' },
        { version: '3.8', expected: '3.8.8' },
        { version: '30', expected: '30.1.0' },
      ])('resolves $version to $expected', async ({ version, expected }) => {
        scope(repoUrl).get(metadataPath).reply(200, metadata);
        const { svc } = await toolContext(MavenVersionResolver);

        expect(await svc.resolve(version)).toBe(expected);
      });

      /** Metadata xml listing the given versions. */
      function metadataOf(...versions: string[]): string {
        const items = versions.map((v) => `<version>${v}</version>`).join('');
        return `<metadata><versioning><versions>${items}</versions></versioning></metadata>`;
      }

      test('keeps a partial version which is an existing release', async () => {
        scope(repoUrl).get(metadataPath).reply(200, metadataOf('3', '3.9.9'));
        const { svc } = await toolContext(MavenVersionResolver);

        expect(await svc.resolve('3')).toBe('3');
      });

      test.each([
        { version: '3.10', expected: '3.10' },
        { version: '3', expected: '3.10' },
      ])(
        'handles a single listed version for $version',
        async ({ version, expected }) => {
          scope(repoUrl).get(metadataPath).reply(200, metadataOf('3.10'));
          const { svc } = await toolContext(MavenVersionResolver);

          expect(await svc.resolve(version)).toBe(expected);
        },
      );

      test.each([
        { name: 'invalid xml', body: '<metadata><versions>' },
        { name: 'an unexpected document', body: '<html><body/></html>' },
      ])('keeps a partial version for $name', async ({ body }) => {
        scope(repoUrl).get(metadataPath).reply(200, body);
        const { svc } = await toolContext(MavenVersionResolver);

        expect(await svc.resolve('3.9')).toBe('3.9');
      });

      test('reads the metadata from the replaced url', async () => {
        vi.stubEnv('URL_REPLACE_0_FROM', repoUrl);
        vi.stubEnv('URL_REPLACE_0_TO', 'https://mirror.example.com');
        scope('https://mirror.example.com')
          .get(metadataPath)
          .reply(200, metadataOf('3.8.8', '3.9.9'));
        const { svc } = await toolContext(MavenVersionResolver);

        expect(await svc.resolve('3')).toBe('3.9.9');
      });

      test.each(['4', '5', '2', '3.7'])(
        'throws for %s without a matching release',
        async (version) => {
          scope(repoUrl).get(metadataPath).reply(200, metadata);
          const { svc } = await toolContext(MavenVersionResolver);

          await expect(svc.resolve(version)).rejects.toThrow(
            `No maven release found for version ${version}`,
          );
        },
      );

      test('keeps a partial version when the lookup fails', async () => {
        scope(repoUrl).get(metadataPath).times(3).replyWithError('reset');
        const { svc } = await toolContext(MavenVersionResolver);

        expect(await svc.resolve('3.9')).toBe('3.9');
      });
    });
  });
});
