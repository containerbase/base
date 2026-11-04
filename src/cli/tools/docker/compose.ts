import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { pathExists, semverGte } from '../../utils/index.ts';

const minVersion = '2.0.1';

@injectable()
@injectFromHierarchy()
export class DockerComposeInstallService extends BaseInstallService {
  readonly name = 'docker-compose';
  override readonly parent = 'docker';

  /** The oldest version `validate` accepts. */
  override readonly minVersion = minVersion;

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
   * Downloads the compose binary from GitHub into the versioned `bin` folder.
   * The file and its checksum come from the tool-versions data, without data
   * it is verified against the release's `checksums.txt` from v2.5.0.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/docker/compose/releases/download/v${version}/`;
    const filename = `${this.name}-linux-${this.ghArch}`;

    // releases before 2.5.0 have no checksums
    const file = semverGte(version, '2.5.0')
      ? await this.downloadChecksumListed(
          version,
          baseUrl,
          filename,
          'checksums.txt',
        )
      : await this.downloadWithoutChecksum(version, `${baseUrl}${filename}`);

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
    return (await super.validate(version)) && semverGte(version, minVersion);
  }
}
