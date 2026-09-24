import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class BazeliskInstallService extends BaseInstallService {
  readonly name = 'bazelisk';

  /**
   * Downloads the bazelisk binary from GitHub into the versioned `bin`
   * folder, with a `bazel` symlink to it. No checksums are verified.
   */
  override async install(version: string): Promise<void> {
    const baseurl = `https://github.com/bazelbuild/bazelisk/releases/download/v${version}/`;
    const filename = `bazelisk-linux-${this.envSvc.arch}`;

    const file = await this.http.download({
      url: `${baseurl}${filename}`,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);

    const binarypath = join(path, 'bazelisk');
    await fs.copyFile(file, binarypath);
    await this.pathSvc.setOwner({
      path: binarypath,
    });
    await fs.symlink(binarypath, join(path, 'bazel'));
  }

  /** Links the `bazelisk` and `bazel` binaries into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({
      srcDir: src,
    });
    await this.shellwrapper({
      name: 'bazel',
      srcDir: src,
    });
  }

  /** Checks that `bazelisk version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('bazelisk', ['version']);
  }
}
