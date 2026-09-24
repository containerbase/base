import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { semverCoerce } from '../../utils/index.ts';
import { GradleVersionData } from './schema.ts';

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

  /** Resolves a missing version or `latest` from services.gradle.org. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return GradleVersionData.parse(
        await this.http.getJson('https://services.gradle.org/versions/current'),
      )?.version;
    }
    return version;
  }
}
