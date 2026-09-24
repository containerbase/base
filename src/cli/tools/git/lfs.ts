import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { semverGte } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class GitLfsInstallService extends BaseInstallService {
  override readonly name = 'git-lfs';
  override readonly parent = 'git';

  /**
   * Downloads the git-lfs archive from GitHub, verified against the release's
   * `sha256sums.asc`, and copies only the `git-lfs` binary into the versioned
   * `bin` folder.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/git-lfs/git-lfs/releases/download/v${version}/`;
    const filename = `${this.name}-linux-${this.envSvc.arch}-v${version}.tar.gz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}sha256sums.asc`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.endsWith(filename))
      ?.split(' ')[0];
    if (!expectedChecksum) {
      throw new Error(`Checksum for ${filename} not found`);
    }

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    const tmp = await fs.mkdtemp(join(this.envSvc.tmpDir, `${this.name}-`));
    // v3.2+ has a subdir https://github.com/git-lfs/git-lfs/pull/4980
    await this.compress.extract({
      file,
      cwd: tmp,
      strip: semverGte(version, '3.2.0') ? 1 : 0,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    await fs.copyFile(join(tmp, this.name), join(path, this.name));
    await fs.rm(tmp, { recursive: true, force: true });
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
