import fs from 'node:fs/promises';
import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class HelmInstallService extends BaseInstallService {
  readonly name = 'helm';

  /**
   * Downloads the helm archive from get.helm.sh, verified against its
   * `.sha256sum`, and extracts it into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-v${version}-linux-${this.envSvc.arch}.tar.gz`;
    const url = `https://get.helm.sh/${filename}`;

    const expectedChecksum = await this.getChecksum(`${url}.sha256sum`);
    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });
    await this.pathSvc.ensureToolPath(this.name);
    const cwd = path.join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(cwd);
    await this.compress.extract({ file, cwd, strip: 1 });
  }

  /** Links the `helm` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `helm version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
