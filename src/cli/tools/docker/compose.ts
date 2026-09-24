import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { pathExists, semverGte } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class DockerComposeInstallService extends BaseInstallService {
  readonly name = 'docker-compose';
  override readonly parent = 'docker';

  /** The architecture name used by the compose release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the compose binary from GitHub into the versioned `bin` folder,
   * verified against the release's `checksums.txt` from v2.5.0.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/docker/compose/releases/download/v${version}/`;
    const filename = `${this.name}-linux-${this.ghArch}`;

    let expectedChecksum: string | undefined;
    if (semverGte(version, '2.5.0')) {
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

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    const bin = join(path, this.name);
    await fs.copyFile(file, bin);
    await fs.chmod(bin, this.envSvc.umask);
  }

  /**
   * Links the `docker-compose` binary into the global bin folder and as
   * docker cli plugin.
   */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    // to track linked version
    await this.shellwrapper({ srcDir: src });

    const tgt = join(
      this.pathSvc.cachePath,
      `.docker/cli-plugins/${this.name}`,
    );
    if (await pathExists(tgt)) {
      await fs.rm(tgt);
    }
    await fs.symlink(join(src, this.name), tgt);
  }

  /** Checks that `docker compose version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('docker', ['compose', 'version']);
  }

  /** Accepts semver versions from 2.0.1. */
  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, '2.0.1');
  }
}
