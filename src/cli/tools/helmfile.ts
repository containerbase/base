import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class HelmfileInstallService extends BaseInstallService {
  readonly name = 'helmfile';
  override readonly minVersion = '0.145.0';

  /**
   * Downloads the helmfile archive from GitHub and extracts it into the
   * versioned `bin` folder. The file and its checksum come from the
   * tool-versions data, without data it is verified against the release's
   * checksums file.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}_${version}_linux_${this.envSvc.arch}.tar.gz`;
    const url = `https://github.com/${name}/${name}/releases/download/v${version}/`;

    const file = await this.downloadChecksumListed(
      version,
      url,
      filename,
      `${name}_${version}_checksums.txt`,
    );
    await this.pathSvc.ensureToolPath(this.name);
    const cwd = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
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
