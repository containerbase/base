import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../install-tool/install-tool-base.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';

@injectable()
export class InstallGleamService extends InstallToolBaseService {
  readonly name = 'gleam';

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x64';
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
      url: `${url}.sha256`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url,
      checksumType: 'sha256',
      expectedChecksum,
    });

    if (!(await this.pathSvc.findToolPath(this.name))) {
      await this.pathSvc.createToolPath(this.name);
    }

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);

    await fs.mkdir(path);
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], { stdio: ['inherit', 'inherit', 1] });
  }
}
