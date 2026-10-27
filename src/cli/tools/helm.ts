import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class HelmInstallService extends BaseInstallService {
  readonly name = 'helm';

  /** The `.sha256sum` files exist from 3.1.0. */
  override readonly minVersion = '3.1.0';

  /**
   * Downloads the helm archive from get.helm.sh and extracts it into the
   * versioned `bin` folder. The file and its checksum come from the
   * tool-versions data, without data it is verified against its `.sha256sum`.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-v${version}-linux-${this.envSvc.arch}.tar.gz`;
    const url = `https://get.helm.sh/${filename}`;

    const file = await this.downloadChecksumSidecar(version, url, '.sha256sum');
    await this.pathSvc.ensureToolPath(this.name);
    const cwd = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
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
