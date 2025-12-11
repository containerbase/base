import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';

@injectable()
@injectFromHierarchy()
export class ApkoInstallService extends BaseInstallService {
  readonly name = 'apko';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'amd64';
    }
  }

  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/chainguard-dev/apko/releases/tag/v0.30.11}
     */
    const baseUrl = `https://github.com/chainguard-dev/apko/releases/download/v${version}/`;

    const filename = `apko_${version}_linux_${this.ghArch}.tar.gz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}checksums.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
