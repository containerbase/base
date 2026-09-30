import { join } from 'node:path';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { BasePrepareService } from '../prepare-tool/base-prepare.service.ts';
import { AptService } from '../services/index.ts';
import { getDistro, parse } from '../utils/index.ts';

/** The distro specific dependencies. */
const distroPackages: Record<string, string[] | undefined> = {
  jammy: [
    'binutils',
    'gnupg2',
    'libc6-dev',
    'libcurl4-openssl-dev',
    'libedit2',
    'libgcc-9-dev',
    'libpython3.8',
    'libsqlite3-0',
    'libstdc++-9-dev',
    'libxml2-dev',
    'libz3-dev',
    'pkg-config',
    'tzdata',
    'unzip',
    'zlib1g-dev',
  ],
  noble: [
    'binutils',
    'gnupg2',
    'libc6-dev',
    'libcurl4-openssl-dev',
    'libedit2',
    'libgcc-9-dev',
    'libncurses6',
    'libpython3.8',
    'libsqlite3-0',
    'libstdc++-9-dev',
    'libxml2-dev',
    'libz3-dev',
    'pkg-config',
    'tzdata',
    'unzip',
    'zlib1g-dev',
  ],
  resolute: [
    'binutils',
    'gnupg2',
    'libc6-dev',
    'libcurl4-openssl-dev',
    'libedit2',
    'libgcc-11-dev',
    'libncurses6',
    'libpython3.14',
    'libsqlite3-0',
    'libstdc++-11-dev',
    'libxml2-dev',
    'libz3-dev',
    'pkg-config',
    'tzdata',
    'unzip',
    'zlib1g-dev',
  ],
};

@injectable()
@injectFromHierarchy()
export class SwiftPrepareService extends BasePrepareService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name = 'swift';

  /**
   * Installs the apt packages swift needs on the current ubuntu release, then
   * initializes the cache and links `~/.swiftpm` to it.
   *
   * @throws on an unsupported distro
   */
  override async prepare(): Promise<void> {
    const distro = await getDistro();
    const packages = distroPackages[distro.versionCode];
    if (!packages) {
      throw new Error(
        `Tool '${this.name}' not supported on: ${distro.versionCode}! Please use ubuntu 'jammy', 'noble' or 'resolute'.`,
      );
    }

    await this.aptSvc.install(...packages);

    await this.initialize();

    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, '.swiftpm'),
      join(this.envSvc.userHome, '.swiftpm'),
    );
  }

  /** Creates the `.swiftpm` folder in the containerbase cache. */
  override async initialize(): Promise<void> {
    await this.pathSvc.createDir(join(this.pathSvc.cachePath, '.swiftpm'));
  }
}

@injectable()
@injectFromHierarchy()
export class SwiftInstallService extends BaseInstallService {
  override readonly name = 'swift';

  /**
   * Downloads the swift archive from download.swift.org and extracts it into
   * the versioned tool path. Swift only publishes a PGP `.sig` file, not a
   * checksum, so this downloads without verifying one.
   */
  override async install(version: string): Promise<void> {
    const distro = await getDistro();
    const versionId = distro.versionId === '24.04' ? '22.04' : distro.versionId;
    const arch = this.envSvc.arch === 'arm64' ? '-aarch64' : '';
    const platform = `ubuntu${versionId}${arch}`;

    const { major, minor, patch } = parse(version);
    const releaseVersion = patch === 0 ? `${major}.${minor}` : version;
    const release = `swift-${releaseVersion}-RELEASE`;
    const webDir = `https://download.swift.org/swift-${releaseVersion}-release/${platform.replace(/\./g, '')}`;

    const file = await this.http.download({
      url: `${webDir}/${release}/${release}-${platform}.tar.gz`,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 2 });
  }

  /** Links the `swift` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    await this.shellwrapper({
      srcDir: join(this.pathSvc.versionedToolPath(this.name, version), 'bin'),
    });
  }

  /** Checks that `swift --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('swift', ['--version']);
  }
}
