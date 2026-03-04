import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service';

@injectable()
@injectFromHierarchy()
export class GhcPrepareService extends BasePrepareService {
  readonly name = 'ghc';
}

@injectable()
@injectFromHierarchy()
export class GhcInstallService extends BaseInstallService {
  readonly name = 'ghc';

  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://downloads.haskell.org/~ghc/${version}/`;
    // use static deb10 binary as it is compatible with all supported ubuntu versions
    const filename = `ghc-${version}-${this.arch}-deb10-linux.tar.xz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}SHA256SUMS`,
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

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
    await this.shellwrapper({ srcDir: src, name: 'ghc-pkg' });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn('ghc', ['--version']);
  }
}
