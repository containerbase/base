import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service';
import { ToolVersionResolver } from '../../install-tool/tool-version-resolver';
import { getDistro, logger } from '../../utils';

@injectable()
@injectFromHierarchy()
export abstract class PrebuildInstallService extends BaseInstallService {
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  protected get tool(): string {
    return this.name;
  }

  override async install(version: string): Promise<void> {
    const name = this.name;
    const distro = await getDistro();
    let code = distro.versionCode;

    if (code === 'noble') {
      logger.debug(`Using jammy prebuild for ${name} on ${code}`);
      code = 'jammy';
    }
    const filename = `${version}/${name}-${version}-${code}-${this.ghArch}.tar.xz`;
    const checksumFileUrl = `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}.sha512`;
    const hasChecksum = await this.http.exists(checksumFileUrl);
    let file: string;

    if (hasChecksum) {
      // no checksums for older prebuilds
      const expectedChecksum = await this.getChecksum(checksumFileUrl);
      file = await this.http.download({
        url: `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}`,
        checksumType: 'sha512',
        expectedChecksum,
      });
    } else {
      file = await this.http.download({
        url: `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}`,
      });
    }

    const path = await this.pathSvc.ensureToolPath(this.name);

    await this.compress.extract({ file, cwd: path });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.tool, ['--version']);
  }

  private async getChecksum(checksumFileUrl: string): Promise<string> {
    const checksumFile = await this.http.download({ url: checksumFileUrl });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).trim();
    return expectedChecksum;
  }
}

@injectable()
@injectFromHierarchy()
export abstract class PrebuildVersionResolver extends ToolVersionResolver {
  async resolve(version: string | undefined): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await this.http.get(
        `https://github.com/containerbase/${this.tool}-prebuild/releases/latest/download/version`,
      );
    }
    return version;
  }
}
