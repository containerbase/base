import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { semverSatisfies } from '../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class GhInstallService extends BaseInstallService {
  readonly name = 'gh';

  override async install(version: string): Promise<void> {
    /**
     * The GitHub CLI ships self-contained Go binaries as `gh_<version>_linux_<arch>.tar.gz` release assets, alongside a single `gh_<version>_checksums.txt` covering every asset of that release.
     * @see {@link https://github.com/cli/cli/releases}
     */
    const baseUrl = `https://github.com/cli/cli/releases/download/v${version}/`;
    const dirname = `gh_${version}_linux_${this.envSvc.arch}`;
    const filename = `${dirname}.tar.gz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}gh_${version}_checksums.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.endsWith(filename))
      ?.split(/\s+/)[0];

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    // the archive also ships man pages and completions under `share/`, which
    // aren't needed at runtime, so only extract `bin/gh`.
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
      files: [`${dirname}/bin/gh`],
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  override async validate(version: string): Promise<boolean> {
    // only the `v2` line ships the release assets we consume
    return (
      (await super.validate(version)) && semverSatisfies(version, '^2.0.0')
    );
  }
}
