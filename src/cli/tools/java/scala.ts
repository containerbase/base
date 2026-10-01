import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { semverGte } from '../../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class ScalaInstallService extends BaseInstallService {
  readonly name = 'scala';

  override readonly parent = 'java';

  /**
   * Downloads the scala archive from GitHub releases, or from lightbend for
   * versions before v2.10.5, and extracts it into the versioned tool path.
   * Neither host publishes checksums, so the download is unverified.
   */
  override async install(version: string): Promise<void> {
    const filename = `${this.name}-${version}.tgz`;
    // scala publishes its releases on GitHub since v2.10.5, lightbend no longer has v2.13.17+
    const url = semverGte(version, '2.10.5')
      ? `https://github.com/scala/scala/releases/download/v${version}/${filename}`
      : `https://downloads.lightbend.com/${this.name}/${version}/${filename}`;

    const file = await this.http.download({ url });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  /** Links the `scala` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  /** Checks that `scala --version` runs. */
  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
