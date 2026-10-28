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
  override readonly minVersion = '3.0.4';

  override readonly parent = 'java';

  /**
   * Installs the containerbase maven prebuild when there is one, else the
   * apache distribution from repo.maven.apache.org. The prebuild and its
   * checksum come from the tool-versions data first. Without data both are
   * verified against their `.sha512`, or a `.sha1` for old apache releases.
   *
   * @throws when no checksum file is found
   */
  override async install(version: string): Promise<void> {
    const filename = `${this.name}-${version}.tar.xz`;
    const prebuild =
      (await this.downloadNamedToolFile(version, filename)) ??
      (await this.downloadPrebuild(version, filename));
    const file = prebuild ?? (await this.downloadApache(version));

    let path = await this.pathSvc.ensureToolPath(this.name);

    if (!prebuild) {
      // from repo.maven.apache.org
      path = await this.pathSvc.createVersionedToolPath(this.name, version);
    }

    await this.compress.extract({
      file,
      cwd: path,
      strip: prebuild ? undefined : 1,
    });
  }

  /**
   * Downloads the containerbase prebuild from its GitHub release when it has
   * a `.sha512`, verified against it. It probes the `.sha512` itself instead
   * of using {@link downloadOptionalChecksumSidecar}, so the source is logged
   * before the download starts.
   * @returns `undefined` when there is no prebuild
   */
  private async downloadPrebuild(
    version: string,
    filename: string,
  ): Promise<string | undefined> {
    const url = `https://github.com/containerbase/${this.name}-prebuild/releases/download/${version}/${filename}`;
    const checksumFileUrl = `${url}.sha512`;
    if (!(await this.http.exists(checksumFileUrl))) {
      return undefined;
    }
    logger.info(`using github`);
    const expectedChecksum = await this.getChecksum(checksumFileUrl);
    return await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });
  }

  /**
   * Downloads the apache distribution from repo.maven.apache.org, verified
   * against its `.sha512`, or a `.sha1` for old releases.
   *
   * @throws when no checksum file is found
   */
  private async downloadApache(version: string): Promise<string> {
    logger.info(`using repo.maven.apache.org`);
    const filename = `apache-${this.name}-${version}-bin.tar.gz`;
    const url = `https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${version}/${filename}`;
    const file =
      (await this.downloadOptionalChecksumSidecar(url, '.sha512', 'sha512')) ??
      (await this.downloadOptionalChecksumSidecar(url, '.sha1', 'sha1'));
    if (!file) {
      throw new Error(`checksum file not found for ${filename}`);
    }
    return file;
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
      return await this.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    if (isPartialVersion(version)) {
      let versions: string[];
      try {
        versions = MavenMetadata.parse(
          parser.parse(await this.get(metadataUrl)),
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
