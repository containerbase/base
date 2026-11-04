import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class DevboxInstallService extends BaseInstallService {
  readonly name = 'devbox';
  override readonly minVersion = '0.0.6';

  /**
   * Downloads the devbox archive from GitHub and extracts it into the
   * versioned `bin` folder. The file and its checksum come from the
   * tool-versions data, without data it is verified against the release's
   * `checksums.txt`.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/jetify-com/devbox/releases/download/${version}/`;
    const filename = `devbox_${version}_linux_${this.envSvc.arch}.tar.gz`;

    const file = await this.downloadChecksumListed(
      version,
      baseUrl,
      filename,
      'checksums.txt',
    );

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

  /** Links the `devbox` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `devbox version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
