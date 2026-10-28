import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class PixiInstallService extends BaseInstallService {
  readonly name = 'pixi';

  /** The `.sha256` files exist from 0.39.2. */
  override readonly minVersion = '0.39.2';

  /** The architecture name used by the pixi release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the pixi archive from GitHub and extracts it into the versioned
   * `bin` folder. The file and its checksum come from the tool-versions data,
   * without data it is verified against its `.sha256`.
   */
  override async install(version: string): Promise<void> {
    const url = `https://github.com/prefix-dev/pixi/releases/download/v${version}/${this.name}-${this.ghArch}-unknown-linux-musl.tar.gz`;

    const file = await this.downloadChecksumSidecar(version, url, '.sha256');

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await this.compress.extract({
      file,
      cwd: path,
    });
  }

  /** Links the `pixi` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `pixi --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
