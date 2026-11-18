import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class VpInstallService extends BaseInstallService {
  readonly name = 'vp';
  override readonly parent = 'node';
  /** Vite+ only publishes the `vp-checksums.txt` file since v0.3.1. */
  override readonly minVersion = '0.3.1';

  /** The target name used by the Vite+ release assets. */
  private get target(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads and extracts the Vite+ release. The file and its checksum come
   * from the tool-versions data, without data it is verified against the
   * release's `vp-checksums.txt`.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/voidzero-dev/vite-plus/releases/download/v${version}/`;
    const filename = `vp-${this.target}-unknown-linux-gnu.tar.gz`;

    const file = await this.downloadChecksumListed(
      version,
      baseUrl,
      filename,
      'vp-checksums.txt',
    );

    await this.pathSvc.ensureToolPath(this.name);
    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await this.compress.extract({ file, cwd: path });
  }

  /** Links the vp binary into the global bin folder, with the Node runtime it needs. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src, extraToolEnvs: ['node'] });
  }

  /** Checks that vp runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
