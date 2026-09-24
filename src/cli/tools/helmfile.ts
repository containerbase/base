import fs from 'node:fs/promises';
import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class HelmfileInstallService extends BaseInstallService {
  readonly name = 'helmfile';

  /**
   * Downloads the helmfile archive from GitHub, verified against the
   * release's checksums file, and extracts it into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}_${version}_linux_${this.envSvc.arch}.tar.gz`;
    const url = `https://github.com/${name}/${name}/releases/download/v${version}/`;

    const expectedChecksum = await this.findChecksum(
      `${url}${name}_${version}_checksums.txt`,
      filename,
    );
    const file = await this.http.download({
      url: `${url}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });
    await this.pathSvc.ensureToolPath(this.name);
    const cwd = path.join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(cwd);
    await this.compress.extract({ file, cwd });
  }

  /**
   * Links the `helmfile` binary into the global bin folder, with its upgrade
   * notice turned off.
   */
  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({
      srcDir: src,
      exports: 'HELMFILE_UPGRADE_NOTICE_DISABLED=1',
    });
  }

  /** Checks that `helmfile version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
