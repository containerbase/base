import path from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';

@injectable()
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

  private version(version: string): string {
    // Remove patch version from version string
    // since the download URL does not include it
    return version.split('.').slice(0, 2).join('.');
  }

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(_version: string): Promise<void> {
    const name = this.name;
    const version = this.version(_version);

    const url = `https://github.com/protocolbuffers/protobuf/releases/download/v${version}/${name}-${version}-linux-${this.ghArch}.zip`;

    const file = await this.http.download({
      url,
    });

    const cwd = await this.pathSvc.createVersionedToolPath(name, version);

    await this.compress.extract({ file, cwd });
  }

  override async link(_version: string): Promise<void> {
    const version = this.version(_version);
    const src = path.join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}
