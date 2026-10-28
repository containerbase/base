import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class KubectlInstallService extends BaseInstallService {
  readonly name = 'kubectl';

  /**
   * The first release with a `.sha256`, which the install requires; 1.14.0 to
   * 1.14.6 and 1.15.0 to 1.15.3 have none either.
   */
  override readonly minVersion = '1.13.11';

  /**
   * Downloads the kubectl binary from dl.k8s.io into the versioned `bin`
   * folder. The file and its checksum come from the tool-versions data,
   * without data it is verified against its `.sha256`.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://dl.k8s.io/release/v${version}/bin/linux/${this.envSvc.arch}/`;
    const filename = this.name;

    // the binary has the same name for all archs and versions
    const file = await this.downloadChecksumSidecar(
      version,
      `${baseUrl}${filename}`,
      '.sha256',
      { name: `${filename}-v${version}-${this.envSvc.arch}` },
    );

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await fs.copyFile(file, join(path, filename));
    await fs.chmod(join(path, filename), this.envSvc.umask);
  }

  /** Links the `kubectl` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `kubectl version --client` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version', '--client']);
  }
}
