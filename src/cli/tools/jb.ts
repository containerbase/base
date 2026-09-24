import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class JsonnetBundlerInstallService extends BaseInstallService {
  readonly name = 'jb';

  /**
   * Downloads the jb binary from GitHub into the versioned `bin` folder.
   * jsonnet-bundler publishes no checksums, so the download is unverified.
   */
  override async install(version: string): Promise<void> {
    const file = await this.http.download({
      url: `https://github.com/jsonnet-bundler/jsonnet-bundler/releases/download/v${version}/${this.name}-linux-${this.envSvc.arch}`,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    const target = join(path, this.name);
    await fs.copyFile(file, target);
    await fs.chmod(target, this.envSvc.umask);
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
}
