import { join } from 'node:path';
import { CompactBuilderFactory } from '@nodable/compact-builder';
import { XMLParser } from '@nodable/flexible-xml-parser';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import {
  ToolVersionResolver,
  isPartialVersion,
  newestVersion,
  partialVersionHelp,
} from '../../install-tool/tool-version-resolver.ts';
import type { HttpChecksumType } from '../../services/http.service';
import { isValid, logger } from '../../utils/index.ts';
import { MavenMetadata } from './schema.ts';

const metadataUrl =
  'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml';

const builder = new CompactBuilderFactory({
  // keep versions like `3.10` as text, they are no numbers
  tags: { valueParsers: ['entity', 'trim'] },
});

const parser = new XMLParser({
  skip: { declaration: true, pi: true, nsPrefix: true },
  OutputBuilder: builder as any, // https://github.com/nodable/flexible-xml-parser/issues/3
});

@injectable()
@injectFromHierarchy()
export class MavenInstallService extends BaseInstallService {
  readonly name = 'maven';

  override readonly parent = 'java';

  /**
   * Installs the containerbase maven prebuild when there is one, else the
   * apache distribution from repo.maven.apache.org. Both are verified
   * against their `.sha512`, or a `.sha1` for old apache releases.
   *
   * @throws when no checksum file is found
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    let filename = `${name}-${version}.tar.xz`;
    let url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;
    let checksumFileUrl = `${url}.sha512`;
    const isOnGithub = await this.http.exists(checksumFileUrl);
    let file: string;
    let strip: number | undefined;

    if (isOnGithub) {
      logger.info(`using github`);
      const expectedChecksum = await this.getChecksum(checksumFileUrl);
      file = await this.http.download({
        url,
        checksumType: 'sha512',
        expectedChecksum,
      });
    } else {
      logger.info(`using repo.maven.apache.org`);
      strip = 1;
      // fallback to repo.maven.apache.org
      filename = `apache-${name}-${version}-bin.tar.gz`;
      url = `https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${version}/${filename}`;
      checksumFileUrl = `${url}.sha512`;
      let expectedChecksum: string;
      let checksumType: HttpChecksumType;
      if (await this.http.exists(checksumFileUrl)) {
        logger.debug(`using sha512 checksum for ${filename}`);
        expectedChecksum = await this.getChecksum(`${url}.sha512`);
        checksumType = 'sha512';
      } else if (await this.http.exists(`${url}.sha1`)) {
        logger.debug(`using sha1 checksum for ${filename}`);
        expectedChecksum = await this.getChecksum(`${url}.sha1`);
        checksumType = 'sha1';
      } else {
        throw new Error(`checksum file not found for ${filename}`);
      }

      file = await this.http.download({
        url,
        checksumType,
        expectedChecksum,
      });
    }

    let path = await this.pathSvc.ensureToolPath(this.name);

    if (strip) {
      // from archive.apache.org
      path = await this.pathSvc.createVersionedToolPath(this.name, version);
    }

    await this.compress.extract({ file, cwd: path, strip });
  }

  /** Accepts any semver version and maven release versions like `3.0`. */
  override validate(version: string): Promise<boolean> {
    return Promise.resolve(isValid(version) || /^\d+\.\d+$/.test(version));
  }

  /** Links the `mvn` binary into the global bin folder, with the java env. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({
      srcDir: src,
      name: 'mvn',
      extraToolEnvs: ['java'],
    });
  }

  /** Checks that `mvn --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('mvn', ['--version']);
  }
}

@injectable()
@injectFromHierarchy()
export class MavenVersionResolver extends ToolVersionResolver {
  readonly tool = 'maven';

  override readonly versionHelp = partialVersionHelp;

  /**
   * Resolves a version, the release list is read from repo.maven.apache.org
   * through the configured CDN and URL replacements.
   *
   * - A missing version or `latest` resolves to the latest maven prebuild.
   * - A major (`3`) or major.minor (`3.9`) version which is no existing
   *   release resolves to the newest matching stable release, prereleases
   *   like `4.0.0-rc-1` are skipped. An existing release is kept. Without
   *   access to the release list the version is kept too.
   * - Any other version is returned unchanged.
   *
   * @throws if a partial version matches no release.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.http.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    if (isPartialVersion(version)) {
      let versions: string[];
      try {
        versions = MavenMetadata.parse(
          parser.parse(await this.http.get(metadataUrl)),
        );
      } catch (err) {
        // keep the version: an `X.Y` release like `3.0` passes `validate` and
        // installs from the repo.maven.apache.org fallback, a bare major fails
        // validation
        logger.debug(
          { err, tool: this.tool, version },
          'maven metadata lookup or parsing failed, keeping the version',
        );
        return version;
      }
      const releases = versions.filter((v) => /^\d+(\.\d+)*$/.test(v));
      if (releases.includes(version)) {
        return version;
      }
      const release = newestVersion(
        releases.filter((v) => v.startsWith(`${version}.`)),
      );
      if (!release) {
        throw new Error(`No ${this.tool} release found for version ${version}`);
      }
      return release;
    }
    return version;
  }
}
