import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { getDistro } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class PhpPrepareService extends BasePrepareService {
  override readonly name = 'php';

  /**
   * Installs the apt packages php needs on the current ubuntu release.
   *
   * @throws on an unsupported distro
   */
  override async prepare(): Promise<void> {
    const distro = await getDistro();

    switch (distro.versionCode) {
      case 'jammy':
      case 'noble':
        await this.aptSvc.install(
          'libjpeg-turbo8',
          'libmcrypt4',
          'libonig5',
          'libpng16-16',
          'libtidy5deb1',
          'libxslt1.1',
          'libzip4',
        );

        break;

      case 'resolute':
        await this.aptSvc.install(
          'libjpeg-turbo8',
          'libmcrypt4',
          'libonig5',
          'libpng16-16t64',
          'libtidy58',
          'libxslt1.1',
          'libzip5',
        );

        break;
      default:
        throw new Error(`Unsupported distro version: ${distro.versionCode}`);
    }
  }
}

@injectable()
@injectFromHierarchy()
export class PhpInstallService extends BaseInstallService {
  readonly name = 'php';

  /** The first jammy prebuild. */
  override readonly minVersion = '7.4.0';

  /** The resolute prebuilds start with 8.1.31, there are none for 7.x and 8.0. */
  override readonly distroMinVersion = { resolute: '8.1.31' };

  /** The architecture name used by the php prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the distro specific containerbase php prebuild and extracts it
   * into the tool path. The file and its checksum come from the tool-versions
   * data, the one of the host distro first. Noble falls back to the jammy
   * prebuild, without data it is verified against its `.sha512`.
   */
  override async install(version: string): Promise<void> {
    const host = (await getDistro()).versionCode;
    const code = host === 'noble' ? 'jammy' : host;
    const file =
      (await this.downloadDistroToolFile(version, host, code)) ??
      (await this.downloadPrebuild(version, code));

    const path = await this.pathSvc.ensureToolPath(this.name);

    await this.compress.extract({ file, cwd: path });
  }

  /**
   * Downloads the php prebuild of the distro from its GitHub release, verified
   * against its `.sha512`.
   */
  private async downloadPrebuild(
    version: string,
    code: string,
  ): Promise<string> {
    const name = this.name;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${name}-${version}-${code}-${this.ghArch}.tar.xz`;

    // every jammy and resolute prebuild has a checksum
    const expectedChecksum = await this.getChecksum(`${url}.sha512`);
    return await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });
  }

  /** Links the binaries, see `postInstall`. */
  override async link(version: string): Promise<void> {
    await this.postInstall(version);
  }

  /** Links the `php` binary into the global bin folder. */
  override async postInstall(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `php --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn('php', ['--version']);
  }
}

@injectable()
@injectFromHierarchy()
export class PhpVersionResolver extends ToolVersionResolver {
  readonly tool = 'php';

  /** Resolves a missing version or `latest` to the latest php prebuild. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    return version;
  }
}
