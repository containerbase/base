import fs from 'node:fs/promises';
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
export class PixiInstallService extends BaseInstallService {
  readonly name = 'pixi';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const name = this.name;

    const url = `https://github.com/prefix-dev/pixi/releases/download/v${version}/${this.name}-${this.ghArch}-unknown-linux-musl.tar.gz`;
    const checksumFileUrl = `${url}.sha25612`;

    const checksumFile = await this.http.download({ url: checksumFileUrl });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .trim()
      .split(' ')[0];

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    const cwd = await this.pathSvc.ensureToolPath(name);

    await this.compress.extract({ file, cwd });
  }

  override async link(version: string): Promise<void> {
    const src = this.pathSvc.versionedToolPath(this.name, version);
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}
