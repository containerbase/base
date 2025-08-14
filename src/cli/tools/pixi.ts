import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { injectFromBase, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';

@injectable()
@injectFromBase()
export class PixiInstallService extends BaseInstallService {
  readonly name = 'pixi';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const url = `https://github.com/prefix-dev/pixi/releases/download/v${version}/${this.name}-${this.ghArch}-unknown-linux-musl.tar.gz`;
    const checksumFileUrl = `${url}.sha256`;

    const checksumFile = await this.http.download({ url: checksumFileUrl });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .trim()
      .split(' ')[0];

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
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}
