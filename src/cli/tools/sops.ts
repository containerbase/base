import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class SopsInstallService extends BaseInstallService {
  readonly name = 'sops';

  /**
   * Downloads the sops binary from GitHub, verified against the release's
   * checksums file, into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/getsops/${this.name}/releases/download/v${version}/`;
    const filename = `${this.name}-v${version}.linux.${this.envSvc.arch}`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}${this.name}-v${version}.checksums.txt`,
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

  /** Links the `sops` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `sops --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
