import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { semverCoerce } from '../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class ProtocInstallService extends BaseInstallService {
  readonly name = 'protoc';

  /** The architecture name used by the protoc release assets. */
  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch_64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the protoc zip from GitHub and extracts it into the versioned
   * tool path. No checksums are verified.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;

    const url = `https://github.com/protocolbuffers/protobuf/releases/download/v${version}/${name}-${version}-linux-${this.ghArch}.zip`;

    const file = await this.http.download({
      url,
    });

    const cwd = await this.pathSvc.createVersionedToolPath(name, version);

    await this.compress.extract({ file, cwd });
  }

  /** Links the `protoc` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `protoc --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }

  /** Accepts any version semver can coerce, eg. `25.1`. */
  override validate(version: string): Promise<boolean> {
    return Promise.resolve(semverCoerce(version) !== null);
  }
}
