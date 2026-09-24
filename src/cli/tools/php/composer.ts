import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';

@injectable()
@injectFromHierarchy()
export class ComposerInstallService extends BaseInstallService {
  readonly name = 'composer';
  override readonly parent = 'php';

  /**
   * Downloads the containerbase composer prebuild, verified against its
   * `.sha512`, and extracts it into the tool path.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;

    const expectedChecksum = await this.getChecksum(`${url}.sha512`);
    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
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
      return await this.http.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    return version;
  }
}
