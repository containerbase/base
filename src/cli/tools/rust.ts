import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { BasePrepareService } from '../prepare-tool/base-prepare.service.ts';

@injectable()
@injectFromHierarchy()
export class RustPrepareService extends BasePrepareService {
  override readonly name = 'rust';

  override async prepare(): Promise<void> {
    await this.initialize();

    await fs.symlink(
      join(this.pathSvc.cachePath, '.cargo'),
      join(this.envSvc.userHome, '.cargo'),
    );
  }

  override async initialize(): Promise<void> {
    await this.pathSvc.createDir(join(this.pathSvc.cachePath, '.cargo'));
  }
}

@injectable()
@injectFromHierarchy()
export class RustInstallService extends BaseInstallService {
  override readonly name = 'rust';

  private get rustArch(): string {
    return this.envSvc.arch === 'arm64' ? 'aarch64' : 'x86_64';
  }

  override async install(version: string): Promise<void> {
    const target = `${this.rustArch}-unknown-linux-gnu`;
    let filename = `rust-${version}-${target}.tar`;
    if (version.startsWith('nightly-')) {
      filename = `${version.slice('nightly-'.length)}/rust-nightly-${target}.tar`;
    }
    const baseUrl = `https://static.rust-lang.org/dist/${filename}`;

    // not all releases have xz archives
    const ext = (await this.http.exists(`${baseUrl}.xz.sha256`)) ? 'xz' : 'gz';
    const url = `${baseUrl}.${ext}`;

    const checksumFile = await this.http.download({ url: `${url}.sha256` });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).split(
      ' ',
    )[0];
    if (!expectedChecksum) {
      throw new Error(`Checksum for ${url} not found`);
    }

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    const tmp = await fs.mkdtemp(join(this.envSvc.tmpDir, `${this.name}-`));
    await this.compress.extract({ file, cwd: tmp, strip: 1 });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this._spawn(join(tmp, 'install.sh'), [
      `--prefix=${path}`,
      `--components=cargo,rust-std-${target},rustc`,
    ]);
    await fs.rm(tmp, { recursive: true, force: true });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ name: 'cargo', srcDir: src });
    await this.shellwrapper({ name: 'rustc', srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn('cargo', ['--version']);
    await this._spawn('rustc', ['--version']);
  }

  override validate(version: string): Promise<boolean> {
    // allow beta and nightly versions
    if (
      version === 'beta' ||
      version === 'nightly' ||
      version.startsWith('nightly-')
    ) {
      return Promise.resolve(true);
    }
    return super.validate(version);
  }
}
