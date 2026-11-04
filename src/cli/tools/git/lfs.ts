import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { semverGte } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class GitLfsInstallService extends BaseInstallService {
  override readonly name = 'git-lfs';

  /** arm64 builds and sha256sums exist from 2.6.0. */
  override readonly minVersion = '2.6.0';
  override readonly parent = 'git';

  /**
   * Downloads the git-lfs archive from GitHub and copies only the `git-lfs`
   * binary into the versioned `bin` folder. The file and its checksum come
   * from the tool-versions data, without data it is verified against the
   * release's `sha256sums.asc`.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/git-lfs/git-lfs/releases/download/v${version}/`;
    const filename = `${this.name}-linux-${this.envSvc.arch}-v${version}.tar.gz`;

    const file = await this.downloadChecksumListed(
      version,
      baseUrl,
      filename,
      'sha256sums.asc',
    );

    await this.pathSvc.withTempDir(`${this.name}-`, async (tmp) => {
      // v3.2+ has a subdir https://github.com/git-lfs/git-lfs/pull/4980
      await this.compress.extract({
        file,
        cwd: tmp,
        strip: semverGte(version, '3.2.0') ? 1 : 0,
      });

      await this.pathSvc.ensureToolPath(this.name);

      const path = await this.pathSvc.createVersionedToolPath(
        this.name,
        version,
        'bin',
      );
      await fs.copyFile(join(tmp, this.name), join(path, this.name));
    });
  }

  /**
   * Links the `git-lfs` binary into the global bin folder and registers its
   * git filters, system wide when running as root.
   */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
    await this._spawn('git', [
      'lfs',
      'install',
      ...(this.envSvc.isRoot ? ['--system'] : []),
    ]);
  }

  /** Checks that `git lfs version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('git', ['lfs', 'version']);
  }
}
