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
   * Adds the user to a `docker` group, and links the user's `.docker` folder
   * and the global cli plugins folder to the cache.
   */
  override async prepare(): Promise<void> {
    await this._spawn('groupadd', ['-g', '999', 'docker']);
    await this._spawn('usermod', ['-aG', 'docker', this.envSvc.userName]);
    const globalDocker = join(this.envSvc.rootDir, 'usr/local/lib/docker');
    await fs.mkdir(globalDocker, { recursive: true });
    await fs.symlink(
      join(this.pathSvc.cachePath, '.docker'),
      join(this.envSvc.userHome, '.docker'),
    );
    await fs.symlink(
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
   * the versioned `bin` folder. No checksums are verified.
   */
  override async install(version: string): Promise<void> {
    const url = `https://download.docker.com/linux/static/stable/${this.arch}/docker-${version}.tgz`;
    const file = await this.http.download({ url });

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
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
