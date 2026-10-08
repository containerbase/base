import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import {
  ToolVersionResolver,
  isPartialVersion,
  newestVersion,
  partialVersionHelp,
} from '../../install-tool/tool-version-resolver.ts';
import { logger, semverCoerce } from '../../utils/index.ts';
import { GradleReleases, GradleVersionData } from './schema.ts';

@injectable()
@injectFromHierarchy()
export class GradleInstallService extends BaseInstallService {
  readonly name = 'gradle';
  override readonly parent = 'java';

  /**
   * Downloads the gradle distribution, verified against its `.sha256`, and
   * extracts it into the versioned tool path.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}-bin.zip`;
    const url = `https://services.gradle.org/distributions/${filename}`;
    const checksumFileUrl = `${url}.sha256`;

    const expectedChecksum = await this.getChecksum(checksumFileUrl);
    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);

    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  /** Links the `gradle` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `gradle --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('gradle', ['--version']);
  }

  /** Accepts any version semver can coerce, eg. `8.5`. */
  override validate(version: string): Promise<boolean> {
    return Promise.resolve(semverCoerce(version) !== null);
  }
}

@injectable()
@injectFromHierarchy()
export class GradleVersionResolver extends ToolVersionResolver {
  readonly tool = 'gradle';

  override readonly versionHelp = partialVersionHelp;

  /**
   * Resolves a version, the release list is read from services.gradle.org.
   *
   * - A missing version or `latest` resolves to the current release.
   * - A major (`8`) or major.minor (`9.0`) version which is no existing
   *   release resolves to the newest matching stable release. An existing
   *   release like `8.10` is kept, and so is the version when the release
   *   list can't be loaded.
   * - Any other version is returned unchanged.
   *
   * @throws if a partial version matches no release.
   */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return GradleVersionData.parse(
        await this.http.getJson('https://services.gradle.org/versions/current'),
      )?.version;
    }
    if (isPartialVersion(version)) {
      let releases: { all: string[]; stable: string[] };
      try {
        releases = GradleReleases.parse(
          await this.http.getJson('https://services.gradle.org/versions/all'),
        );
      } catch (err) {
        // keep the version like before partial versions were resolved: an
        // existing `X.Y` release still installs, while a bare major passes the
        // loose gradle validation and then fails to download
        logger.debug(
          { err, tool: this.tool, version },
          'gradle release lookup or parsing failed, keeping the version',
        );
        return version;
      }
      // any listed release is kept as given, even one gradle marks as broken
      if (releases.all.includes(version)) {
        return version;
      }
      const release = newestVersion(
        releases.stable.filter((v) => v.startsWith(`${version}.`)),
      );
      if (!release) {
        throw new Error(`No ${this.tool} release found for version ${version}`);
      }
      return release;
    }
    return version;
  }
}
