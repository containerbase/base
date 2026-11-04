import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class DenoInstallService extends BaseInstallService {
  readonly name = 'deno';

  /** 2.0.0's checksum file has another name, 1.x has none. */
  override readonly minVersion = '2.0.1';

  /** The architecture name used by the deno release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the deno zip from GitHub and extracts it into the versioned
   * `bin` folder. The file and its checksum come from the tool-versions data,
   * without data it is verified against its `.sha256sum`.
   */
  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/denoland/deno/releases/tag/v2.4.5}
     */
    const baseUrl = `https://github.com/denoland/deno/releases/download/v${version}/`;

    const filename = `deno-${this.ghArch}-unknown-linux-gnu.zip`;
    const url = `${baseUrl}${filename}`;

    const file = await this.downloadChecksumSidecar(version, url, '.sha256sum');

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );

    await this.compress.extract({
      file,
      cwd: path,
      strip: 0,
    });
  }

  /** Links the `deno` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `deno --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
