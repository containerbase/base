import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { BasePrepareService } from '../prepare-tool/base-prepare.service.ts';
import { semverGte } from '../utils/index.ts';

/** Matches a dated nightly version, e.g. `nightly-2024-01-01`. */
const nightlyDateRegex = /^nightly-\d{4}-\d{2}-\d{2}$/;

@injectable()
@injectFromHierarchy()
export class RustPrepareService extends BasePrepareService {
  override readonly name = 'rust';

  /** Initializes the cache and links `~/.cargo` to it, keeping an existing one. */
  override async prepare(): Promise<void> {
    await this.initialize();

    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.cargo'),
      join(this.envSvc.userHome, '.cargo'),
    );
  }

  /** Creates the `.cargo` folder in the containerbase cache. */
  override async initialize(): Promise<void> {
    await this.pathSvc.createDir(join(this.pathSvc.cachePath, '.cargo'));
  }
}

@injectable()
@injectFromHierarchy()
export class RustInstallService extends BaseInstallService {
  override readonly name = 'rust';

  /** The architecture name used by the rust release archives. */
  private get rustArch(): string {
    return this.envSvc.arch === 'arm64' ? 'aarch64' : 'x86_64';
  }

  /**
   * Rust publishes `.tar.xz` archives since v1.19.0 and nightly 2017-05-05,
   * the `.tar.gz` ones before.
   */
  private archiveExt(version: string): 'xz' | 'gz' {
    if (version === 'beta' || version === 'nightly') {
      return 'xz';
    }
    if (version.startsWith('nightly-')) {
      // validate only lets `nightly-YYYY-MM-DD` through, so dates compare as strings
      return version.slice('nightly-'.length) >= '2017-05-05' ? 'xz' : 'gz';
    }
    return semverGte(version, '1.19.0') ? 'xz' : 'gz';
  }

  /**
   * Downloads the rust archive from static.rust-lang.org, verified against its
   * `.sha256`, and runs its `install.sh` for cargo, rustc and the standard
   * library into the versioned tool path. Uses the `.xz` archive since
   * v1.19.0 / nightly 2017-05-05, and the `.gz` one before.
   */
  override async install(version: string): Promise<void> {
    const target = `${this.rustArch}-unknown-linux-gnu`;
    let filename = `rust-${version}-${target}.tar`;
    if (version.startsWith('nightly-')) {
      filename = `${version.slice('nightly-'.length)}/rust-nightly-${target}.tar`;
    }
    const baseUrl = `https://static.rust-lang.org/dist/${filename}`;

    const url = `${baseUrl}.${this.archiveExt(version)}`;

    const expectedChecksum = await this.getChecksum(`${url}.sha256`);

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.withTempDir(`${this.name}-`, async (tmp) => {
      await this.compress.extract({ file, cwd: tmp, strip: 1 });

      await this.pathSvc.ensureToolPath(this.name);

      const path = await this.pathSvc.createVersionedToolPath(
        this.name,
        version,
      );
      await this._spawn(join(tmp, 'install.sh'), [
        `--prefix=${path}`,
        `--components=cargo,rust-std-${target},rustc`,
      ]);
    });
  }

  /** Links the `cargo` and `rustc` binaries into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ name: 'cargo', srcDir: src });
    await this.shellwrapper({ name: 'rustc', srcDir: src });
  }

  /** Checks that `cargo --version` and `rustc --version` run. */
  override async test(_version: string): Promise<void> {
    await this._spawn('cargo', ['--version']);
    await this._spawn('rustc', ['--version']);
  }

  /** Accepts `beta`, `nightly`, `nightly-YYYY-MM-DD` and semver versions. */
  override validate(version: string): Promise<boolean> {
    if (
      version === 'beta' ||
      version === 'nightly' ||
      nightlyDateRegex.test(version)
    ) {
      return Promise.resolve(true);
    }
    return super.validate(version);
  }
}
