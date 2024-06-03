import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { CleanOptions, ResetMode, simpleGit } from 'simple-git';
import { InstallToolBaseService } from '../install-tool/install-tool-base.service';
import { PrepareToolBaseService } from '../prepare-tool/prepare-tool-base.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';
import { logger } from '../utils';

@injectable()
export class PrepareFlutterService extends PrepareToolBaseService {
  readonly name = 'flutter';

  override async execute(): Promise<void> {
    const flutter = join(this.envSvc.userHome, '.flutter');
    await fs.writeFile(flutter, '{ "firstRun": false, "enabled": false }');
    await fs.chown(flutter, this.envSvc.userId, 0);
    await fs.chmod(flutter, 0o664);

    await fs.writeFile(
      join(this.envSvc.rootDir, '/root/.flutter'),
      '{ "firstRun": false, "enabled": false }',
    );

    await this.pathSvc.exportEnv(
      { PUB_CACHE: `${this.pathSvc.cachePath}/.pub-cache` },
      true,
    );
  }
}

@injectable()
export class InstallFlutterService extends InstallToolBaseService {
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
    const checksumFileUrl = `${url}.sha512`;
    const isOnGithub = await this.http.exists(checksumFileUrl);

    if (isOnGithub) {
      logger.info(`using github prebuild`);
      const checksumFile = await this.http.download({ url: checksumFileUrl });
      const expectedChecksum = (
        await fs.readFile(checksumFile, 'utf-8')
      ).trim();
      const file = await this.http.download({
        url,
        checksumType: 'sha512',
        expectedChecksum,
      });
      await this.compress.extract({ file, cwd: await this.getToolPath() });
    } else {
      logger.info(`using github source repo`);
      await this.getToolPath();
      const path = await this.pathSvc.createVersionedToolPath(
        this.name,
        version,
      );
      const git = simpleGit({ baseDir: path });
      await git.clone('https://github.com/flutter/flutter.git', '.', {
        '--filter': 'blob:none',
        '--branch': 'stable',
      });

      await git.reset(ResetMode.HARD, [version]);

      await git.addConfig(
        'safe.directory',
        path,
        true,
        this.envSvc.isRoot ? 'system' : 'global',
      );

      // init flutter
      await execa(`./bin/flutter`, ['--version'], { cwd: path });
      await execa(`./bin/flutter`, ['pub', 'get', '--help'], { cwd: path });

      // cleanup
      await git.clean(CleanOptions.FORCE + CleanOptions.IGNORED_INCLUDED, [
        '--',
        '**/.packages',
      ]);
      await git.clean(CleanOptions.FORCE + CleanOptions.IGNORED_INCLUDED, [
        '--',
        '**/.dart_tool/',
      ]);
      await fs.rm(join(path, '.pub-cache/git'), {
        recursive: true,
        force: true,
      });

      // fix permrmissions
      await execa('chmod', ['-R', 'g+w', path]);
    }
  }

  override async link(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
    await this.shellwrapper({ srcDir: src });
  }

  override async test(_version: string): Promise<void> {
    await execa('flutter', ['--version'], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  private async getToolPath(): Promise<string> {
    return (
      (await this.pathSvc.findToolPath(this.name)) ??
      (await this.pathSvc.createToolPath(this.name))
    );
  }
}
