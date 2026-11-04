import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class TerraformInstallService extends BaseInstallService {
  readonly name = 'terraform';
  override readonly minVersion = '0.1.0';

  /**
   * Downloads the terraform zip from releases.hashicorp.com and extracts it
   * into the versioned `bin` folder. The file and its checksum come from the
   * tool-versions data, without data it is verified against its `SHA256SUMS`.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://releases.hashicorp.com/${this.name}/${version}/`;
    const filename = `${this.name}_${version}_linux_${this.envSvc.arch}.zip`;

    const file = await this.downloadChecksumListed(
      version,
      baseUrl,
      filename,
      `${this.name}_${version}_SHA256SUMS`,
    );

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await this.compress.extract({ file, cwd: path });
  }

  /** Links the `terraform` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `terraform version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
