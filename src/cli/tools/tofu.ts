import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class TofuInstallService extends BaseInstallService {
  readonly name = 'tofu';

  /** The architecture name used by the tofu release assets. */
  private get ghArch(): string {
    return this.envSvc.arch;
  }

  /**
   * Downloads the tofu archive from GitHub, verified against the release's
   * `SHA256SUMS`, and extracts it into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/opentofu/opentofu/releases/tag/v1.10.6}
     */
    const baseUrl = `https://github.com/opentofu/opentofu/releases/download/v${version}/`;

    const filename = `tofu_${version}_linux_${this.ghArch}.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}tofu_${version}_SHA256SUMS`,
      filename,
    );

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);

    await this.compress.extract({
      file,
      cwd: path,
    });
  }

  /** Links the `tofu` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `tofu --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
