import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';

@injectable()
@injectFromHierarchy()
export class tofuInstallService extends BaseInstallService {
  readonly name = 'tofu';

  private get ghArch(): string {
    return this.envSvc.arch;
  }

  override async install(version: string): Promise<void> {
    /**
     * @example
     * @see {@href https://github.com/opentofu/opentofu/releases/tag/v1.10.6}
     */
    const baseUrl = `https://github.com/opentofu/opentofu/releases/download/v${version}/`;

    const filename = `tofu_${version}_linux_${this.ghArch}.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}tofu_${version}_SHA256SUMS`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);

    await this.compress.extract({
      file,
      cwd: path,
      strip: 0,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], { stdio: ['inherit', 'inherit', 1] });
  }
}
