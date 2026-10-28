import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';

@injectable()
@injectFromHierarchy()
export class GhcPrepareService extends BasePrepareService {
  readonly name = 'ghc';
}

@injectable()
@injectFromHierarchy()
export class GhcInstallService extends BaseInstallService {
  readonly name = 'ghc';

  /** The first release with the `x86_64-deb10-linux` bindist. */
  override readonly minVersion = '8.10.1';

  /** The architecture name used by the ghc release archives. */
  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the static deb10 ghc archive from downloads.haskell.org and
   * extracts it into the versioned tool path. The file and its checksum come
   * from the tool-versions data, without data it is verified against the
   * release's `SHA256SUMS`.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://downloads.haskell.org/~ghc/${version}/`;
    // use static deb10 binary as it is compatible with all supported ubuntu versions
    const filename = `ghc-${version}-${this.arch}-deb10-linux.tar.xz`;

    const file = await this.downloadChecksumListed(
      version,
      baseUrl,
      filename,
      'SHA256SUMS',
    );

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
    });
  }

  /** Links the `ghc` and `ghc-pkg` binaries into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
    await this.shellwrapper({ srcDir: src, name: 'ghc-pkg' });
  }

  /** Checks that `ghc --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('ghc', ['--version']);
  }
}
