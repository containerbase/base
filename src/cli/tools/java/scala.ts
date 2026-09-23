import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';

@injectable()
@injectFromHierarchy()
export class ScalaInstallService extends BaseInstallService {
  readonly name = 'scala';

  override readonly parent = 'java';

  override async install(version: string): Promise<void> {
    // no checksums are published
    const file = await this.http.download({
      url: `https://downloads.lightbend.com/${this.name}/${version}/${this.name}-${version}.tgz`,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}
