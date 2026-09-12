import fs from 'node:fs/promises';
import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import type { Arch } from '../utils/index.ts';

// Stable machine-readable marker consumed by Renovate. Do not reword it.
export const VP_SYNC_VERSIONS_UNAVAILABLE =
  'CONTAINERBASE_VP_SYNC_VERSIONS_UNAVAILABLE';

export function vitePlusAssetName(arch: Arch): string {
  const target = arch === 'arm64' ? 'aarch64' : 'x86_64';
  return `vp-${target}-unknown-linux-gnu.tar.gz`;
}

export function parseVitePlusChecksum(
  checksums: string,
  filename: string,
): string {
  for (const line of checksums.split('\n')) {
    const match = /^([a-f\d]{64})\s+\*?(.+)$/i.exec(line.trim());
    const checksum = match?.[1];
    if (checksum && match?.[2] === filename) {
      return checksum.toLowerCase();
    }
  }
  throw new Error(`Cannot find checksum for '${filename}' in vp-checksums.txt`);
}

@injectable()
@injectFromHierarchy()
export class VpInstallService extends BaseInstallService {
  readonly name = 'vp';
  override readonly parent = 'node';

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/voidzero-dev/vite-plus/releases/download/v${version}/`;
    const filename = vitePlusAssetName(this.envSvc.arch);
    const checksumUrl = `${baseUrl}vp-checksums.txt`;

    if (!(await this.http.exists(checksumUrl))) {
      throw new Error(
        `${VP_SYNC_VERSIONS_UNAVAILABLE}:${version}: Vite+ release does not provide the sync-versions planner`,
      );
    }

    const checksumFile = await this.http.download({
      url: checksumUrl,
    });
    const expectedChecksum = parseVitePlusChecksum(
      await fs.readFile(checksumFile, 'utf8'),
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
    await this.compress.extract({ file, cwd: path });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src, extraToolEnvs: ['node'] });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
