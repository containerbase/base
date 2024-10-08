import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { BaseInstallService } from '../install-tool/base-install.service';
import { BasePrepareService } from '../prepare-tool/base-prepare.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';
import {
  initDartHome,
  initPubCache,
  prepareDartHome,
  preparePubCache,
} from './dart/utils';

@injectable()
export class FlutterPrepareService extends BasePrepareService {
  readonly name = 'flutter';

  override async prepare(): Promise<void> {
    await this.initialize();
    await prepareDartHome(this.envSvc, this.pathSvc);
    await preparePubCache(this.envSvc, this.pathSvc);

    // for root
    await fs.writeFile(
      join(this.envSvc.rootDir, 'root', '.flutter'),
      '{ "firstRun": false, "enabled": false }',
    );

    // for user
    await fs.symlink(
      join(this.pathSvc.cachePath, '.flutter'),
      join(this.envSvc.userHome, '.flutter'),
    );

    await fs.symlink(
      join(this.pathSvc.cachePath, '.flutter_tool_state'),
      join(this.envSvc.userHome, '.flutter_tool_state'),
    );
  }

  override async initialize(): Promise<void> {
    await initDartHome(this.pathSvc);
    await initPubCache(this.pathSvc);

    // for user
    await this.pathSvc.writeFile(
      join(this.pathSvc.cachePath, '.flutter'),
      '{ "firstRun": false, "enabled": false }\n',
    );

    await this.pathSvc.writeFile(
      join(this.pathSvc.cachePath, '.flutter_tool_state'),
      '{ "is-bot": false, "redisplay-welcome-message": false }\n',
    );
  }
}

@injectable()
export class FlutterInstallService extends BaseInstallService {
  readonly name = 'flutter';

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
    const filename = `${name}-${version}-${this.ghArch}.tar.xz`;
    const url = `https://github.com/containerbase/${name}-prebuild/releases/download/${version}/${filename}`;

    const checksumFile = await this.http.download({ url: `${url}.sha512` });
    const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8')).trim();
    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });
    await this.compress.extract({ file, cwd: await this.getToolPath() });
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src, args: '--no-version-check' });
  }

  override async test(_version: string): Promise<void> {
    await execa('flutter', ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  private async getToolPath(): Promise<string> {
    return await this.pathSvc.ensureToolPath(this.name);
  }
}
