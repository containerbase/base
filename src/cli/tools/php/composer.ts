import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';

@injectable()
@injectFromHierarchy()
export class ComposerInstallService extends BaseInstallService {
  readonly name = 'composer';
  override readonly minVersion = '1.0.0';
  override readonly parent = 'php';

  /**
   * Downloads the containerbase composer prebuild and extracts it into the
   * tool path. The file and its checksum come from the tool-versions data,
   * without data it is verified against its `.sha512`.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;

    const file = await this.downloadChecksumSidecar(version, url, '.sha512', {
      checksumType: 'sha512',
    });

    const path = await this.pathSvc.ensureToolPath(this.name);
    await this.compress.extract({ file, cwd: path });
  }

  /** Links the `composer` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `composer --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('composer', ['--version']);
  }
}

@injectable()
@injectFromHierarchy()
export class ComposerVersionResolver extends ToolVersionResolver {
  readonly tool = 'composer';

  /** Resolves a missing version or `latest` to the latest composer prebuild. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    return version;
  }
}
