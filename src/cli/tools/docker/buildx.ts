import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { pathExists, semverGte } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class BuildxInstallService extends BaseInstallService {
  readonly name = 'buildx';

  override readonly parent = 'docker';

  /**
   * Downloads the buildx binary from GitHub into the versioned `bin` folder,
   * verified against the release's `checksums.txt` from v0.7.0.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/docker/${this.name}/releases/download/v${version}/`;
    const filename = `${this.name}-v${version}.linux-${this.envSvc.arch}`;

    let expectedChecksum: string | undefined;
    if (semverGte(version, '0.7.0')) {
      expectedChecksum = await this.findChecksum(
        `${baseUrl}checksums.txt`,
        filename,
      );
    }

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    const bin = join(path, this.name);
    await fs.copyFile(file, bin);
    await fs.chmod(bin, this.envSvc.umask);
  }

  /**
   * Links the `buildx` binary into the global bin folder and as docker cli
   * plugin.
   */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    // to track linked version
    await this.shellwrapper({ srcDir: src });

    const tgt = join(
      this.pathSvc.cachePath,
      `.docker/cli-plugins/docker-${this.name}`,
    );
    if (await pathExists(tgt)) {
      await fs.rm(tgt);
    }
    await fs.symlink(join(src, this.name), tgt);
  }

  /** Checks that `docker buildx version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('docker', ['buildx', 'version']);
  }
}
