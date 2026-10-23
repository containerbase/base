import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver.ts';
import { getDistro } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export abstract class PrebuildInstallService extends BaseInstallService {
  /** The architecture name used by the containerbase prebuilds. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /** The binary to test, by default the tool name. */
  protected get tool(): string {
    return this.name;
  }

  /**
   * Downloads the distro specific containerbase prebuild and extracts it into
   * the tool path. The file and its checksum come from the tool-versions
   * data, the one of the host distro first. Newer ubuntu releases fall back to
   * the jammy prebuild, without data it is verified against its `.sha512`.
   */
  override async install(version: string): Promise<void> {
    const file = await this.download(version);

    const path = await this.pathSvc.ensureToolPath(this.name);

    await this.compress.extract({ file, cwd: path });
  }

  /**
   * Downloads the prebuild of the host distro from the tool-versions data,
   * else the jammy one on newer ubuntu releases, from the data or from its
   * GitHub release.
   */
  private async download(version: string): Promise<string> {
    const host = (await getDistro()).versionCode;
    const code = host === 'noble' || host === 'resolute' ? 'jammy' : host;
    return (
      (await this.downloadDistroToolFile(version, host, code)) ??
      (await this.downloadPrebuild(version, code))
    );
  }

  /**
   * Downloads the prebuild of the distro from its GitHub release, verified
   * against its `.sha512`.
   */
  private async downloadPrebuild(
    version: string,
    code: string,
  ): Promise<string> {
    const name = this.name;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${name}-${version}-${code}-${this.ghArch}.tar.xz`;
    // every jammy prebuild has a checksum
    const expectedChecksum = await this.getChecksum(`${url}.sha512`);
    return await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });
  }

  /** Links the tool binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that the tool binary runs with `--version`. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.tool, ['--version']);
  }
}

@injectable()
@injectFromHierarchy()
export abstract class PrebuildVersionResolver extends ToolVersionResolver {
  /** Resolves a missing version or `latest` to the latest prebuild. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.latestVersion();
    }
    return version;
  }

  /** The version of the latest prebuild release. */
  protected async latestVersion(): Promise<string> {
    return await this.get(
      `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
    );
  }
}
