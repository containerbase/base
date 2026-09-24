import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class KubectlInstallService extends BaseInstallService {
  readonly name = 'kubectl';

  /**
   * Downloads the kubectl binary from dl.k8s.io, verified against its
   * `.sha256`, into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://dl.k8s.io/release/v${version}/bin/linux/${this.envSvc.arch}/`;
    const filename = this.name;

    const expectedChecksum = await this.getChecksum(
      `${baseUrl}${filename}.sha256`,
    );

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      fileName: `${filename}-v${version}-${this.envSvc.arch}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
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
