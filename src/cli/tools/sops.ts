import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import { EnvService, HttpService, PathService } from '../services';

@injectable()
export class SopsInstallService extends BaseInstallService {
  readonly name = 'sops';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://github.com/getsops/${this.name}/releases/download/v${version}/`;
    const filename = `${this.name}-v${version}.linux.${this.envSvc.arch}`;

    const checksumFile = await this.http.download({
      url: `${baseUrl}${this.name}-v${version}.checksums.txt`,
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

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    await fs.copyFile(file, join(path, this.name));
    await fs.chmod(join(path, this.name), this.envSvc.umask);
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}
