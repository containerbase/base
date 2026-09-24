import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { isFourPartVersion } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class CabalPrepareService extends BasePrepareService {
  readonly name = 'cabal';
}

@injectable()
@injectFromHierarchy()
export class CabalInstallService extends BaseInstallService {
  readonly name = 'cabal';

  /** The architecture name used by the cabal release archives. */
  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the static deb10 cabal-install archive from downloads.haskell.org,
   * verified against the release's `SHA256SUMS`, and extracts it into the
   * versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://downloads.haskell.org/~cabal/cabal-install-${version}/`;
    // use static deb10 binary as it is compatible with all supported ubuntu versions
    const filename = `cabal-install-${version}-${this.arch}-linux-deb10.tar.xz`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}SHA256SUMS`,
      filename,
    );

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    await this.compress.extract({
      file,
      cwd: path,
    });
  }

  /** Accepts four part versions like `3.10.1.0`. */
  override validate(version: string): Promise<boolean> {
    return Promise.resolve(isFourPartVersion(version));
  }

  /** Links the `cabal` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `cabal --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('cabal', ['--version']);
  }
}
