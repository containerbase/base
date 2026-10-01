import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

interface GitHubRelease {
  assets: {
    digest: string | null;
    name: string;
  }[];
}

@injectable()
@injectFromHierarchy()
export class AubeInstallService extends BaseInstallService {
  readonly name = 'aube';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/jdx/aube/releases/download/v${version}/`;
    const filename = `aube-v${version}-${this.ghArch}-unknown-linux-gnu.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const release = await this.http.getJson<GitHubRelease>(
      `https://api.github.com/repos/jdx/aube/releases/tags/v${version}`,
    );
    const expectedChecksum = release.assets
      .find((asset) => asset.name === filename)
      ?.digest?.replace(/^sha256:/, '');

    if (!expectedChecksum) {
      throw new Error(`Cannot find checksum for '${filename}'`);
    }

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    await this.compress.extract({ file, cwd: path });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
