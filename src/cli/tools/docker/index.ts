import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import { got } from 'got';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { PrepareToolBaseService } from '../../prepare-tool/prepare-tool-base.service';
import { EnvService, PathService } from '../../services';
import { logger } from '../../utils';

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
    @inject(PathService) pathSvc: PathService
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const url = `https://download.docker.com/linux/static/stable/${this.arch}/docker-${version}.tgz`;
    logger.debug({ url }, 'download docker');
    await pipeline(got.stream(url), createWriteStream('/tmp/docker.tgz'));

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin'
    );
    await fs.mkdir(path);
    // TODO: use nodejs buildins
    await execa('bsdtar', [
      '-C',
      path,
      '--strip',
      '1',
      '-xf',
      '/tmp/docker.tgz',
      'docker/docker',
    ]);

    await fs.rm('/tmp/docker.tgz');
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({ name: 'docker', srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('docker', ['--version'], { stdio: 'inherit' });
  }
}
