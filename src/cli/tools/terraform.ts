import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class TerraformInstallService extends BaseInstallService {
  readonly name = 'terraform';

  /**
   * Downloads the terraform zip from releases.hashicorp.com, verified against
   * its `SHA256SUMS`, and extracts it into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://releases.hashicorp.com/${this.name}/${version}/`;
    const filename = `${this.name}_${version}_linux_${this.envSvc.arch}.zip`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}${this.name}_${version}_SHA256SUMS`,
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
