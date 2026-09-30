import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class BufInstallService extends BaseInstallService {
  readonly name = 'buf';

  /** The architecture name used by the buf release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the buf archive from GitHub, verified against the release's
   * `sha256.txt`, and extracts only the `buf` binary into the versioned tool
   * path.
   */
  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/bufbuild/buf/releases/tag/v1.67.0}
     */
    const baseUrl = `https://github.com/bufbuild/buf/releases/download/v${version}/`;

    const filename = `buf-Linux-${this.ghArch}.tar.gz`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}sha256.txt`,
      filename,
    );

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
      files: ['buf/bin/buf'],
    });
  }

  /** Links the `buf` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `buf --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
