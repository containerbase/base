import path from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class KustomizeInstallService extends BaseInstallService {
  readonly name = 'kustomize';

  /** Releases up to 3.2.3 are raw binaries. */
  override readonly minVersion = '3.3.0';

  /**
   * Downloads the kustomize archive from GitHub and extracts it into the
   * versioned `bin` folder. The file and its checksum come from the
   * tool-versions data, without data it is verified against the release's
   * `checksums.txt`.
   */
  override async install(version: string): Promise<void> {
    const name = this.name;
    const filename = `${name}_v${version}_linux_${this.envSvc.arch}.tar.gz`;
    // the tag has a slash, GitHub's own download urls have it unencoded, like
    // the tool-versions data
    const baseUrl = `https://github.com/kubernetes-sigs/${name}/releases/download/${name}/v${version}/`;

    const file = await this.downloadChecksumListed(
      version,
      baseUrl,
      filename,
      'checksums.txt',
    );
    await this.pathSvc.ensureToolPath(this.name);
    const cwd = await this.pathSvc.createVersionedToolPath(
      this.name,
      version,
      'bin',
    );
    await this.compress.extract({ file, cwd });
  }

  /** Links the `kustomize` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `kustomize version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['version']);
  }
}
