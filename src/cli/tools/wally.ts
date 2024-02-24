import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import semver from 'semver';
import { InstallToolBaseService } from '../install-tool/install-tool-base.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';
import { getDistro } from '../utils';

@injectable()
export class InstallWallyService extends InstallToolBaseService {
  readonly name = 'wally';

  constructor(
    @inject(EnvService) envSvc: EnvService,
    @inject(PathService) pathSvc: PathService,
    @inject(HttpService) private http: HttpService,
    @inject(CompressionService) private compress: CompressionService,
  ) {
    super(pathSvc, envSvc);
  }

  override async install(version: string): Promise<void> {
    const distro = await getDistro();

    // wally requires libssl3 which is not easily installable on focal
    if (distro.versionCode === 'focal') {
      throw new Error(`Unsupported distro: ${distro.versionCode}`);
    }

    const baseUrl = `https://github.com/UpliftGames/wally/releases/download/v${version}/`;
    let filename = `wally-v${version}-linux.zip`;

    const ver = semver.parse(version);
    if (!ver) {
      throw new Error(`Invalid version: ${version}`);
    }
    // asset names of v0.3.1 and lower are not prefixed with v
    if (
      ver.major === 0 &&
      ver.minor <= 3 &&
      (ver.minor < 3 || ver.patch <= 1)
    ) {
      filename = `wally-${version}-linux.zip`;
    }

    const file = await this.http.download({
      url: `${baseUrl}${filename}`,
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
    await this.compress.extract({
      file,
      cwd: path,
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
