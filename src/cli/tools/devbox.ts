import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class DevboxInstallService extends BaseInstallService {
  readonly name = 'devbox';

  /**
   * Downloads the devbox archive from GitHub, verified against the release's
   * `checksums.txt`, and extracts it into the versioned `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/jetify-com/devbox/releases/download/${version}/`;
    const filename = `devbox_${version}_linux_${this.envSvc.arch}.tar.gz`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}checksums.txt`,
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

  /** Links the `devbox` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `devbox version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
