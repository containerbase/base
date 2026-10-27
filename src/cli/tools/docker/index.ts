import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';

@injectable()
@injectFromHierarchy()
export class DockerPrepareService extends BasePrepareService {
  readonly name = 'docker';

  /**
   * Adds the user to a `docker` group, creating it if it doesn't already
   * exist, and links the user's `.docker` folder and the global cli plugins
   * folder to the cache, keeping any existing link.
   */
  override async prepare(): Promise<void> {
    await this._spawn('groupadd', ['-f', '-g', '999', 'docker']);
    await this._spawn('usermod', ['-aG', 'docker', this.envSvc.userName]);
    const globalDocker = join(this.envSvc.rootDir, 'usr/local/lib/docker');
    await fs.mkdir(globalDocker, { recursive: true });
    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.docker'),
      join(this.envSvc.userHome, '.docker'),
    );
    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.docker', 'cli-plugins'),
      join(globalDocker, 'cli-plugins'),
    );
  }

  /** Creates the docker cli plugins folder in the containerbase cache. */
  override async initialize(): Promise<void> {
    await this.pathSvc.createDir(
      join(this.pathSvc.cachePath, '.docker', 'cli-plugins'),
    );
  }
}

@injectable()
@injectFromHierarchy()
export class DockerInstallService extends BaseInstallService {
  readonly name = 'docker';

  /**
   * The first semver release: older static builds are named like `17.03.0-ce`
   * or have a zero-padded minor like `19.03.15`, which isn't semver.
   */
  override readonly minVersion = '20.10.0';

  /** The architecture name used by the docker static builds. */
  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the static docker build and extracts only the `docker` cli into
   * the versioned `bin` folder. docker publishes no checksums for it, the
   * archive is verified against the checksum of the tool-versions data, else
   * unverified.
   */
  override async install(version: string): Promise<void> {
    const arch = this.arch;
    const url = `https://download.docker.com/linux/static/stable/${arch}/docker-${version}.tgz`;
    // the file is named the same for all archs, the data adds the arch
    const file = await this.downloadWithoutChecksum(
      version,
      url,
      `docker-${version}-${arch}.tgz`,
    );

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
      files: ['docker/docker'],
    });
  }

  /** Links the `docker` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `docker --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('docker', ['--version']);
  }
}
