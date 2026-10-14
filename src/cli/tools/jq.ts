import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class JqInstallService extends BaseInstallService {
  readonly name = 'jq';

  /** Assets and checksums exist from 1.7, which isn't semver. */
  override readonly minVersion = '1.7.1';

  /**
   * Downloads the jq binary from GitHub, verified against the release's
   * `sha256sum.txt`, into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/jqlang/${this.name}/releases/download/jq-${version}/`;
    const filename = `${this.name}-linux-${this.envSvc.arch}`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}sha256sum.txt`,
      filename,
    );

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await fs.copyFile(file, join(path, this.name));
    await fs.chmod(join(path, this.name), this.envSvc.umask);
  }

  /** Links the `jq` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `jq --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
