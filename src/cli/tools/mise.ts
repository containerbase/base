import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import { ToolVersionResolver } from '../install-tool/tool-version-resolver';

@injectable()
@injectFromHierarchy()
export class MiseInstallService extends BaseInstallService {
  readonly name = 'mise';

  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/jdx/mise/releases/tag/v2026.2.13}
     */
    const baseUrl = `https://github.com/jdx/mise/releases/download/v${version}/`;

    const filename = `mise-v${version}-linux-${this.arch}.tar.xz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}SHASUMS256.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.endsWith(` ./${filename}`))
      ?.split(/\s+/)[0];

    if (!expectedChecksum) {
      throw new Error(
        `Cannot find checksum for '${filename}' in SHASUMS256.txt`,
      );
    }

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

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}

@injectable()
@injectFromHierarchy()
export class MiseVersionResolver extends ToolVersionResolver {
  readonly tool = 'mise';

  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return (await this.http.get('https://mise.jdx.dev/VERSION')).trim();
    }
    return version;
  }
}
