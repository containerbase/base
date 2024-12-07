import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';
import { semverGte } from '../utils';

@injectable()
export class GleamInstallService extends BaseInstallService {
  readonly name = 'gleam';

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
    /**
     * @example
     * @see {@href https://github.com/gleam-lang/gleam/releases/tag/v0.34.1}
     */
    const baseUrl = `https://github.com/gleam-lang/gleam/releases/download/v${version}/`;

    const filename = `gleam-v${version}-${this.ghArch}-unknown-linux-musl.tar.gz`;
    const url = `${baseUrl}${filename}`;

    const checksumFile = await this.http.download({
      url: `${url}.sha512`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);

    await this.compress.extract({
      file,
      cwd: path,
      strip: 0,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version));
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], { stdio: ['inherit', 'inherit', 1] });
  }

  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, '0.19.0-rc1');
  }
}
