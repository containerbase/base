import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import { EnvService, HttpService, PathService } from '../../services';

@injectable()
export class InstallBazeliskService extends InstallToolBaseService {
  readonly name = 'bazelisk';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const baseurl = `https://github.com/bazelbuild/bazelisk/releases/download/v${version}/`;
    const filename = `bazelisk-linux-${this.envSvc.arch}`;

    const file = await this.http.download({
      url: `${baseurl}${filename}`,
    });

    // TODO: create recursive
    if (!(await this.pathSvc.findToolPath(this.name))) {
      await this.pathSvc.createToolPath(this.name);
    }

    const path = join(
      await this.pathSvc.createVersionedToolPath(this.name, version),
      'bin',
    );
    await fs.mkdir(path);

    const binarypath = join(path, 'bazelisk');
    await fs.copyFile(file, binarypath);
    await this.pathSvc.setOwner({
      file: binarypath,
    });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({
      srcDir: src,
    });
    await fs.symlink(
      join(this.pathSvc.binDir, 'bazelisk'),
      join(this.pathSvc.binDir, 'bazel'),
    );
  }

  override async test(_version: string): Promise<void> {
    await execa('bazelisk', ['version'], { stdio: ['inherit', 'inherit', 1] });
  }
}
