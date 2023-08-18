import fs from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { InstallToolBaseService } from '../../install-tool/install-tool-base.service';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../../services';
import { getDistro } from '../../utils';
import { prepareGlobalConfig, prepareUserConfig } from './utils';

@injectable()
export class InstallNodeService extends InstallToolBaseService {
  readonly name = 'node';

  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'arm64';
      case 'amd64':
        return 'x64';
    }
  }

  private get ghArch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_x64';
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
    const distro = await getDistro();
    const arch = this.arch;
    const name = this.name;
    const versionCode = distro.versionCode;
    let filename = ` ${version}/${name}-${version}-${versionCode}-${this.ghArch}.tar.xz`;
    let checksumFileUrl = `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}.sha512`;
    const isOnGithub = await this.http.exists(checksumFileUrl);
    let file: string;

    if (isOnGithub) {
      const checksumFile = await this.http.download({ url: checksumFileUrl });
      const expectedChecksum = (
        await fs.readFile(checksumFile, 'utf-8')
      ).trim();
      file = await this.http.download({
        url: `https://github.com/containerbase/${name}-prebuild/releases/download/${filename}`,
        checksumType: 'sha512',
        expectedChecksum,
      });
    } else {
      checksumFileUrl = `https://nodejs.org/dist/v${version}/SHASUMS256.txt`;
      filename = `${name}-v${version}-linux-${arch}.tar.xz`;
      const checksumFile = await this.http.download({ url: checksumFileUrl });
      const expectedChecksum = (await fs.readFile(checksumFile, 'utf-8'))
        .split('\n')
        .find((l) => l.includes(filename))
        ?.split(' ')[0];
      file = await this.http.download({
        url: `https://nodejs.org/dist/v${version}/${filename}`,
        checksumType: 'sha256',
        expectedChecksum,
      });
    }

    // TODO: create recursive
    if (!(await this.pathSvc.findToolPath(this.name))) {
      await this.pathSvc.createToolPath(this.name);
    }

    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file, cwd: path, strip: 1 });

    if (this.envSvc.isRoot) {
      await prepareGlobalConfig({
        prefix: '/usr/local',
        versionedToolPath: path,
      });
      await prepareUserConfig({
        prefix: `${this.envSvc.userHome}/.npm-global`,
        home: this.envSvc.userHome,
        name: this.envSvc.userName,
      });
    } else {
      await prepareGlobalConfig({
        prefix: `${this.envSvc.userHome}/.npm-global`,
        versionedToolPath: path,
      });
    }
  }

  override async link(version: string): Promise<void> {
    await this.pathSvc.resetToolEnv(this.name);
    await this.postInstall(version);

    await this.pathSvc.exportToolPath(
      this.name,
      join(this.envSvc.userHome, '.npm-global', 'bin'),
    );
    await this.pathSvc.exportToolEnv(this.name, {
      NO_UPDATE_NOTIFIER: '1',
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
    });

    await this.pathSvc.exportToolEnvContent(
      this.name,
      `# openshift override unknown user home
if [ "\${EUID}" != 0 ] && [ "\${EUID}" != ${this.envSvc.userId} ]; then
  export npm_config_prefix="${this.envSvc.userHome}/.npm-global"
fi
`,
    );
  }

  override async postInstall(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    await this.shellwrapper({
      srcDir: src,
      args: '--use-openssl-ca',
    });
    await this.shellwrapper({ srcDir: src, name: 'npm' });
    await this.shellwrapper({ srcDir: src, name: 'npx' });

    if (await this.pathSvc.fileExists(join(src, 'corepack'))) {
      await this.shellwrapper({ srcDir: src, name: 'corepack' });
    }
  }

  override async test(version: string): Promise<void> {
    const src = join(this.pathSvc.versionedToolPath(this.name, version), 'bin');

    // pkg bug, using `node` causes module load error
    await execa('/usr/local/bin/node', ['--version'], { stdio: 'inherit' });
    await execa('npm', ['--version'], { stdio: 'inherit' });
    if (await this.pathSvc.fileExists(join(src, 'corepack'))) {
      await execa('corepack', ['--version'], { stdio: 'inherit' });
    }
  }
}
