import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class TofuInstallService extends BaseInstallService {
  readonly name = 'tofu';

  /** 1.6.0 to 1.6.2 are published as zip only. */
  override readonly minVersion = '1.6.3';

  /** The architecture name used by the tofu release assets. */
  private get ghArch(): string {
    return this.envSvc.arch;
  }

  /**
   * Downloads the tofu archive from GitHub and extracts it into the versioned
   * `bin` folder. The file and its checksum come from the tool-versions data,
   * without data it is verified against the release's `SHA256SUMS`.
   */
  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/opentofu/opentofu/releases/tag/v1.10.6}
     */
    const baseUrl = `https://github.com/opentofu/opentofu/releases/download/v${version}/`;

    const filename = `tofu_${version}_linux_${this.ghArch}.tar.gz`;

    const file = await this.downloadChecksumListed(
      version,
      baseUrl,
      filename,
      `tofu_${version}_SHA256SUMS`,
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
