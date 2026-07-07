import fs from 'node:fs/promises';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class ApmInstallService extends BaseInstallService {
  readonly name = 'apm';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    /**
     * APM (Agent Package Manager) ships self-contained PyInstaller `onedir`
     * bundles (an `apm` binary next to an `_internal` directory) as
     * `apm-<os>-<arch>.tar.gz` release assets, each accompanied by a
     * `.sha256` sidecar.
     * @see {@link https://github.com/microsoft/apm/releases}
     */
    const baseUrl = `https://github.com/microsoft/apm/releases/download/v${version}/`;
    const filename = `apm-linux-${this.ghArch}.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const checksumFile = await this.http.download({ url: `${url}.sha256` });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(/\s+/)[0];

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    // strip the top-level `apm-linux-<arch>` directory so the `apm` binary and
    // its sibling `_internal` bundle end up directly in the versioned path.
    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  override async link(version: string): Promise<void> {
    const src = this.pathSvc.versionedToolPath(this.name, version);
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
