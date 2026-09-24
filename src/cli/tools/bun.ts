import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class BunInstallService extends BaseInstallService {
  readonly name = 'bun';

  /** The architecture name used by the bun release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x64';
    }
  }

  /**
   * Downloads the bun archive from GitHub, verified against the release's
   * `SHASUMS256.txt`, and extracts it into the versioned `bin` folder. On x64
   * without AVX2 the baseline build is used.
   */
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

  /** Links the `bun` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `bun --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
