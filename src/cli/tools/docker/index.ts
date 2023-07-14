import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { PrepareToolBaseService } from '../../prepare-tool/prepare-tool-base.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';

@injectable()
export class PrepareDockerService extends PrepareToolBaseService {
  readonly name = 'docker';

  constructor(@inject(EnvService) private envSvc: EnvService) {
    super();
  }

  async execute(): Promise<void> {
    await execa('groupadd', ['-g', '999', 'docker']);
    await execa('usermod', ['-aG', 'docker', this.envSvc.userName]);
  }
}

@injectable()
export class InstallDockerService extends InstallToolBaseService {
  readonly name = 'docker';

  private get arch(): string {
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
    @inject(CompressionService) private compress: CompressionService
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const url = `https://download.docker.com/linux/static/stable/${this.arch}/docker-${version}.tgz`;
    const file = await this.http.download({ url });

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin'
    );
    await fs.mkdir(path);
    await this.compress.extract({
      file,
      cwd: path,
      strip: 1,
      files: ['docker/docker'],
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ name: 'docker', srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('docker', ['--version'], { stdio: 'inherit' });
  }
}
