import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../install-tool/install-tool-base.service';
import { EnvService, HttpService, PathService } from '../services';

@injectable()
export class InstallKubectlService extends InstallToolBaseService {
  readonly name = 'kubectl';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const baseUrl = `https://dl.k8s.io/release/v${version}/bin/linux/${this.envSvc.arch}/`;
    const filename = this.name;

    const checksumFile = await this.http.download({
      url: `${baseUrl}${filename}.sha256`,
      fileName: `${filename}-v${version}-${this.envSvc.arch}.sha256`,
    });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
      .split('\n')
      .find((l) => l.includes(filename))
      ?.split(' ')[0];

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
      fileName: `${filename}-v${version}-${this.envSvc.arch}`,
      checksumType: 'sha256',
      expectedChecksum,
    });

    await this.pathSvc.ensureToolPath(this.name);

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);
    await fs.copyFile(file, join(path, filename));
    await fs.chmod(join(path, filename), this.envSvc.umask);
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa(this.name, ['version', '--client'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}
