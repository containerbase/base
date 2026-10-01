import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { getDistro, logger } from '../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class WallyInstallService extends BaseInstallService {
  readonly name = 'wally';

  /** The architecture name used by the wally prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the containerbase wally prebuild, verified against its
   * `.sha512`, and extracts it into the tool path. Newer ubuntu releases use
   * the jammy prebuild.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const distro = await getDistro();
    let code = distro.versionCode;

    if (code === 'noble' || code === 'resolute') {
      logger.debug(`Using jammy prebuild for ${name} on ${code}`);
      code = 'jammy';
    }
    const filename = `${name}-${version}-${code}-${this.ghArch}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;
    const checksumFileUrl = `${url}.sha512`;

    const expectedChecksum = await this.getChecksum(checksumFileUrl);

    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    const cwd = await this.pathSvc.ensureToolPath(name);

    await this.compress.extract({ file, cwd });
  }

  /** Links the `wally` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `wally --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
