import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class ApmInstallService extends BaseInstallService {
  readonly name = 'apm';
  override readonly minVersion = '0.4.0';

  /** The architecture name used by the apm release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the apm bundle from GitHub and extracts it into the versioned
   * tool path. The file and its checksum come from the tool-versions data,
   * without data it is verified against its `.sha256`.
   */
  override async install(version: string): Promise<void> {
    /**
     * APM (Agent Package Manager) ships self-contained PyInstaller `onedir`
     * bundles (an `apm` binary next to an `_internal` directory) as
     * `apm-<os>-<arch>.tar.gz` release assets, each accompanied by a
     * `.sha256` sidecar.
     * @see {@link https://github.com/microsoft/apm/releases}
     */
    const baseUrl = `https://github.com/microsoft/apm/releases/download/v${version}/`;
    const filename = `apm-linux-${this.ghArch}.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const file = await this.downloadChecksumSidecar(version, url, '.sha256');

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    // strip the top-level `apm-linux-<arch>` directory so the `apm` binary and
    // its sibling `_internal` bundle end up directly in the versioned path.
    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  /** Links the `apm` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = this.pathSvc.versionedToolPath(this.name, version);
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `apm --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
