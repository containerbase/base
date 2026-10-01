import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { semverGte } from '../utils/index.ts';

/** The oldest version with a prebuild. */
const minVersion = '2.10.3';

@injectable()
@injectFromHierarchy()
export class NixInstallService extends BaseInstallService {
  readonly name = 'nix';

  /** The architecture name used by the nix prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the containerbase nix prebuild, verified against its `.sha512`,
   * and extracts it into the tool path.
   */
  override async install(version: string): Promise<void> {
    const url = `https://github.com/containerbase/${this.name}-prebuild/releases/download/${version}/${this.name}-${version}-${this.ghArch}.tar.xz`;

    const expectedChecksum = await this.getChecksum(`${url}.sha512`);

    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    const path = await this.pathSvc.ensureToolPath(this.name);
    await this.compress.extract({ file, cwd: path });
  }

  /**
   * Links the `nix` binary into the global bin folder, with the nix store and
   * state folders below the containerbase cache.
   */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    const cache = join(this.pathSvc.cachePath, this.name);

    await this.shellwrapper({
      srcDir: src,
      exports: [
        `NIX_STORE_DIR=${cache}/store`,
        `NIX_DATA_DIR=${cache}/data`,
        `NIX_LOG_DIR=${cache}/log`,
        `NIX_STATE_DIR=${cache}/state`,
        `NIX_CONF_DIR=${cache}/conf`,
      ].join(' '),
    });
  }

  /** Checks that `nix --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  /** Accepts semver versions from 2.10.3, the oldest one with a prebuild. */
  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, minVersion);
  }
}
