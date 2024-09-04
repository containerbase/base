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

@injectable()
export class DevboxInstallService extends BaseInstallService {
  readonly name = 'devbox';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/jetify-com/devbox/releases/download/${version}/`;
    const filename = `devbox_${version}_linux_${this.envSvc.arch}.tar.gz`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}checksums.txt`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
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
    await execa(this.name, ['version'], { stdio: ['inherit', 'inherit', 1] });
  }
}
