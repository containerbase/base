import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { isFourPartVersion } from '../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class JsonnetBundlerInstallService extends BaseInstallService {
  readonly name = 'jb';
  override readonly minVersion = '0.2.0';

  /** The architecture name used by the jb prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /** Accepts semver versions and four part prebuild versions like `0.6.0.1`. */
  override async validate(version: string): Promise<boolean> {
    return isFourPartVersion(version) || (await super.validate(version));
  }

  /**
   * Installs a four part version from the containerbase jb prebuild, any other
   * version from the upstream release.
   */
  override async install(version: string): Promise<void> {
    if (isFourPartVersion(version)) {
      await this.installPrebuild(version);
      return;
    }
    await this.installUpstream(version);
  }

  /** Links the `jb` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `jb --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  /**
   * Downloads the containerbase jb prebuild, verified against its `.sha512`,
   * and extracts it into the tool path.
   */
  private async installPrebuild(version: string): Promise<void> {
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
    await this.compress.extract({
      file,
      cwd: await this.pathSvc.ensureToolPath(name),
    });
  }

  /**
   * Downloads the jb binary from GitHub into the versioned `bin` folder.
   * jsonnet-bundler publishes no checksums, so the download is unverified.
   */
  private async installUpstream(version: string): Promise<void> {
    const file = await this.http.download({
      url: `https://github.com/jsonnet-bundler/jsonnet-bundler/releases/download/v${version}/${this.name}-linux-${this.envSvc.arch}`,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    const target = join(path, this.name);
    await fs.copyFile(file, target);
    await fs.chmod(target, this.envSvc.umask);
  }
}
