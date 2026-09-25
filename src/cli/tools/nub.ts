import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class NubInstallService extends BaseInstallService {
  readonly name = 'nub';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/nubjs/nub/releases/download/v${version}/`;
    const filename = `nub-linux-${this.ghArch}.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const expectedChecksum = await this.getChecksum(`${url}.sha256`);

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);
    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    // Preserve the release layout: bin/ and runtime/ are siblings.
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
