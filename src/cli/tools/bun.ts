import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class BunInstallService extends BaseInstallService {
  readonly name = 'bun';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x64';
    }
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${version}/`;
    let { ghArch } = this;

    if (ghArch === 'x64') {
      try {
        const cpuInfo = await fs.readFile('/proc/cpuinfo', 'utf-8');
        if (!cpuInfo.includes('avx2')) {
          ghArch = 'x64-baseline';
        }
      } catch {
        ghArch = 'x64-baseline';
      }
    }

    const filename = `bun-linux-${ghArch}.zip`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}SHASUMS256.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
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
      strip: 1,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
