import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { isFourPartVersion } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class CabalPrepareService extends BasePrepareService {
  readonly name = 'cabal';
}

@injectable()
@injectFromHierarchy()
export class CabalInstallService extends BaseInstallService {
  readonly name = 'cabal';

  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const major = parseInt(version.split('.').at(0)!);
    const baseUrl = `https://downloads.haskell.org/~cabal/cabal-install-${version}/`;

    let file: string;
    const strip = major < 2 ? 7 : 0;

    if (major < 3) {
      if (this.arch !== 'x86_64') {
        throw new Error(
          `Unsupported architecture ${this.envSvc.arch} for cabal-install versions < 3.0. Only x86_64 is supported.`,
        );
      }
      const filename =
        major < 2
          ? `cabal-install-${version}-${this.arch}-unknown-linux.tar.gz`
          : `cabal-install-${version}-${this.arch}-unknown-linux.tar.xz`;

      file = await this.http.download({
        url: `${baseUrl}${filename}`,
      });
    } else {
      // use static deb10 binary as it is compatible with all supported ubuntu versions
      const filename = `cabal-install-${version}-${this.arch}-linux-deb10.tar.xz`;
      const checksumFile = await this.http.download({
        url: `${baseUrl}SHA256SUMS`,
      });
      const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
        .split('\n')
        .find((l) => l.includes(filename))
        ?.split(' ')[0];

      file = await this.http.download({
        url: `${baseUrl}${filename}`,
        checksumType: 'sha256',
        expectedChecksum,
      });
    }

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    await this.compress.extract({
      file,
      cwd: path,
      strip,
    });
  }

  override validate(version: string): Promise<boolean> {
    return Promise.resolve(isFourPartVersion(version));
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn('cabal', ['--version']);
  }
}
