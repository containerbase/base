import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { semverGte } from '../utils/index.ts';

/** The first release which publishes checksums. */
const checksumsSince = '0.25.0';

@injectable()
@injectFromHierarchy()
export class VendirInstallService extends BaseInstallService {
  readonly name = 'vendir';

  /**
   * Downloads the vendir binary from GitHub into the versioned `bin` folder,
   * verified against `checksums.txt` from v0.25.0.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/vmware-tanzu/carvel-vendir/releases/download/v${version}/`;
    const filename = `${this.name}-linux-${this.envSvc.arch}`;

    let expectedChecksum: string | undefined;
    if (semverGte(version, checksumsSince)) {
      expectedChecksum = await this.findChecksum(
        `${baseUrl}checksums.txt`,
        filename,
      );
    }

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    const target = join(path, this.name);
    await fs.copyFile(file, target);
    await fs.chmod(target, this.envSvc.umask);
  }

  /** Links the `vendir` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `vendir --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
