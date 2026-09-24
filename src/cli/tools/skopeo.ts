import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class SkopeoInstallService extends BaseInstallService {
  readonly name = 'skopeo';

  /** The architecture name used by the skopeo prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the containerbase skopeo prebuild, verified against its
   * `.sha512`, and extracts it into the tool path.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}-${version}-${this.ghArch}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;
    const checksumFileUrl = `${url}.sha512`;

    const expectedChecksum = await this.getChecksum(checksumFileUrl);
    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });
    await this.compress.extract({ file, cwd: await this.getToolPath() });
  }

  /** Links the `skopeo` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `skopeo --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('skopeo', ['--version']);
  }

  /** Returns the tool path, creating it when missing. */
  private async getToolPath(): Promise<string> {
    return await this.pathSvc.ensureToolPath(this.name);
  }
}
