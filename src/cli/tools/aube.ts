import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class AubeInstallService extends BaseInstallService {
  readonly name = 'aube';

  /** The tool-versions data starts at 1.0.0, earlier ones are prereleases. */
  override readonly minVersion = '1.0.0';

  /** The arch name of the release assets for the host. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the glibc build from the tool-versions data, verified against
   * its checksum, and extracts it into the versioned `bin` folder.
   * @throws when the data has no file for the version on this host
   */
  override async install(version: string): Promise<void> {
    const filename = `aube-v${version}-${this.ghArch}-unknown-linux-gnu.tar.gz`;

    const file = await this.downloadNamedToolFile(version, filename);
    if (!file) {
      throw new Error(
        `There is no tool-versions file for aube ${version} on this host`,
      );
    }

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await this.compress.extract({ file, cwd: path });
  }

  /** Links the `aube` binaries into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `aube --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
