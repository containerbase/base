import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class PixiInstallService extends BaseInstallService {
  readonly name = 'pixi';

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
   * Downloads the pixi archive from GitHub, verified against its `.sha256`,
   * and extracts it into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const url = `https://github.com/prefix-dev/pixi/releases/download/v${version}/${this.name}-${this.ghArch}-unknown-linux-musl.tar.gz`;
    const checksumFileUrl = `${url}.sha256`;

    const expectedChecksum = await this.getChecksum(checksumFileUrl);

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

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
