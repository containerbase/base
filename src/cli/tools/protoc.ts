import path from 'node:path';
import { execa } from 'execa';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import { semverCoerce } from '../utils';

@injectable()
@injectFromHierarchy()
export class ProtocInstallService extends BaseInstallService {
  readonly name = 'protoc';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch_64';
      case 'amd64':
        return 'x86_64';
    }
  }

  override async install(version: string): Promise<void> {
    const name = this.name;

    const url = `https://github.com/protocolbuffers/protobuf/releases/download/v${version}/${name}-${version}-linux-${this.ghArch}.zip`;

    const file = await this.http.download({
      url,
    });

    const cwd = await this.pathSvc.createVersionedToolPath(name, version);

    await this.compress.extract({ file, cwd });
  }

  override async link(version: string): Promise<void> {
    const src = path.join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  override validate(version: string): Promise<boolean> {
    return Promise.resolve(semverCoerce(version) !== null);
  }
}
