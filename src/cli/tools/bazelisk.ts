import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';

@injectable()
@injectFromHierarchy()
export class BazeliskInstallService extends BaseInstallService {
  readonly name = 'bazelisk';

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

  override async test(_version: string): Promise<void> {
    await this._spawn('bazelisk', ['version']);
  }
}
