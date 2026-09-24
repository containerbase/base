import fs from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { AptService } from '../../services/index.ts';
import { getDistro } from '../../utils/index.ts';

/**
 * The distro specific dependencies.
 * @see {@link https://learn.microsoft.com/en-us/dotnet/core/install/linux-ubuntu-install?tabs=dotnet10&pivots=os-linux-ubuntu-2204#dependencies-4}
 */
const distroPackages: Record<string, string[] | undefined> = {
  jammy: ['libicu70', 'libssl3'],
  noble: ['libicu74', 'libssl3t64'],
  resolute: ['libbrotli1', 'libicu78', 'libssl3t64'],
};

@injectable()
@injectFromHierarchy()
export class PowershellPrepareService extends BasePrepareService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name = 'powershell';

  /**
   * Installs the apt packages powershell needs on the current ubuntu release.
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

    await this.aptSvc.install(
      'libc6',
      'libgcc-s1',
      'libgssapi-krb5-2',
      'libstdc++6',
      'tzdata',
      'zlib1g',
      ...packages,
    );
  }
}

@injectable()
@injectFromHierarchy()
export class PowershellInstallService extends BaseInstallService {
  override readonly name = 'powershell';

  /** The architecture name used by the powershell release assets. */
  private get ghArch(): string {
    return this.envSvc.arch === 'arm64' ? 'arm64' : 'x64';
  }

  /**
   * Downloads the powershell archive from GitHub, verified against the
   * release's `hashes.sha256`, and extracts it into the versioned tool path.
   */
  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/PowerShell/PowerShell/releases/download/v${version}/`;
    const filename = `${this.name}-${version}-linux-${this.ghArch}.tar.gz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}hashes.sha256`,
    });
    const expectedChecksum = readChecksums(await fs.readFile(checksumFile))
      .split('\n')
      .map((l) => l.trim())
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

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path });

    // Happened on v7.3.0
    await fs.chmod(join(path, 'pwsh'), this.envSvc.umask);
  }

  /** Links the `pwsh` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    await this.shellwrapper({
      name: 'pwsh',
      srcDir: this.pathSvc.versionedToolPath(this.name, version),
    });
  }

  /** Checks that `pwsh -version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('pwsh', ['-version']);
  }
}

/**
 * Decodes the release's checksum file, which is UTF-16LE with a BOM, falling
 * back to UTF-8 without one.
 */
function readChecksums(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.toString('utf16le');
  }
  return buf.toString('utf8');
}
