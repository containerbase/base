import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { semverGte } from '../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class GleamInstallService extends BaseInstallService {
  readonly name = 'gleam';

  /** The architecture name used by the gleam release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the gleam archive from GitHub, verified against its `.sha512`,
   * and extracts it into the versioned tool path.
   */
  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/gleam-lang/gleam/releases/tag/v0.34.1}
     */
    const baseUrl = `https://github.com/gleam-lang/gleam/releases/download/v${version}/`;

    const filename = `gleam-v${version}-${this.ghArch}-unknown-linux-musl.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const expectedChecksum = await this.getChecksum(`${url}.sha512`);

    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);

    await this.compress.extract({
      file,
      cwd: path,
      strip: 0,
    });
  }

  /** Links the `gleam` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version));
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `gleam --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  /** Accepts semver versions from 0.19.0-rc1. */
  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, '0.19.0-rc1');
  }
}
