import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class NubInstallService extends BaseInstallService {
  readonly name = 'nub';

  /** The architecture name used by the nub release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  /** Downloads and extracts the nub release, verified against its SHA-256 checksum. */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/nubjs/nub/releases/download/v${version}/`;
    const filename = `nub-linux-${this.ghArch}.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const expectedChecksum = await this.getChecksum(`${url}.sha256`);

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);
    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    // The archive has no top-level folder, so extract without stripping a level.
    await this.compress.extract({ file, cwd: path });
  }

  /** Links the nub binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that nub runs without unpacking its embedded runtime. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
