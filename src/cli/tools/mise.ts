import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { ToolVersionResolver } from '../install-tool/tool-version-resolver.ts';

@injectable()
@injectFromHierarchy()
export class MiseInstallService extends BaseInstallService {
  readonly name = 'mise';

  /** The architecture name used by the mise release assets. */
  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  /**
   * Downloads the mise archive from GitHub, verified against the release's
   * `SHASUMS256.txt`, and extracts only the `mise` binary into the versioned
   * tool path.
   */
  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/jdx/mise/releases/tag/v2026.2.13}
     */
    const baseUrl = `https://github.com/jdx/mise/releases/download/v${version}/`;

    const filename = `mise-v${version}-linux-${this.arch}.tar.xz`;

    const expectedChecksum = await this.findChecksum(
      `${baseUrl}SHASUMS256.txt`,
      filename,
    );

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
      files: ['mise/bin/mise'],
    });
  }

  /** Links the `mise` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `mise version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}

@injectable()
@injectFromHierarchy()
export class MiseVersionResolver extends ToolVersionResolver {
  readonly tool = 'mise';

  /** Resolves a missing version or `latest` from mise.jdx.dev. */
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return (await this.http.get('https://mise.jdx.dev/VERSION')).trim();
    }
    return version;
  }
}
