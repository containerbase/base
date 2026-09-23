import fs from 'node:fs/promises';
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

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const url = `https://github.com/containerbase/${this.name}-prebuild/releases/download/${version}/${this.name}-${version}-${this.ghArch}.tar.xz`;

    const checksumFile = await this.http.download({ url: `${url}.sha512` });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).trim();

    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    const path = await this.pathSvc.ensureToolPath(this.name);
    await this.compress.extract({ file, cwd: path });
  }

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

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, minVersion);
  }
}
