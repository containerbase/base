import fs from 'node:fs/promises';
import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { findChecksum } from '../utils/hash.ts';

@injectable()
@injectFromHierarchy()
export class HelmfileInstallService extends BaseInstallService {
  readonly name = 'helmfile';

  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}_${version}_linux_${this.envSvc.arch}.tar.gz`;
    const url = `https://github.com/${name}/${name}/releases/download/v${version}/`;

    const expectedChecksum = await this._getChecksum(
      `${url}${name}_${version}_checksums.txt`,
      filename,
    );
    const file = await this.http.download({
      url: `${url}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });
    await this.pathSvc.ensureToolPath(this.name);
    const cwd = path.join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(cwd);
    await this.compress.extract({ file, cwd });
  }

  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({
      srcDir: src,
      exports: 'HELMFILE_UPGRADE_NOTICE_DISABLED=1',
    });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }

  protected async _getChecksum(url: string, filename: string): Promise<string> {
    const checksumFile = await this.http.download({ url });
    return findChecksum(await fs.readFile(checksumFile, 'utf-8'), filename);
  }
}
