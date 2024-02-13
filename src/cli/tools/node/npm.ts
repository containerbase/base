import { execa } from 'execa';
import { injectable } from 'inversify';
import { InstallNodeBaseService } from './utils';

@injectable()
export class InstallRenovateService extends InstallNodeBaseService {
  override readonly name: string = 'renovate';

  protected override getAdditionalArgs(): string[] {
    return ['--no-optional', 're2'];
  }

  override prepareEnv(tmp: string): NodeJS.ProcessEnv {
    const env = super.prepareEnv(tmp);
    env.RE2_DOWNLOAD_MIRROR = this.envSvc.replaceUrl(
      'https://github.com/containerbase/node-re2-prebuild/releases/download',
    );
    env.RE2_DOWNLOAD_SKIP_PATH = '1';
    return env;
  }
}

@injectable()
export class InstallYarnSlimService extends InstallNodeBaseService {
  override readonly name: string = 'yarn-slim';

  protected override get tool(): string {
    return 'yarn';
  }

  override async install(version: string): Promise<void> {
    await super.install(version);
    const node = await this.getNodeVersion();
    // TODO: replace with javascript
    const prefix = this.pathSvc.versionedToolPath(this.name, version);
    await execa(
      'sed',
      [
        '-i',
        's/ steps,/ steps.slice(0,1),/',
        `${prefix}/${node}/node_modules/yarn/lib/cli.js`,
      ],
      { stdio: ['inherit', 'inherit', 1] },
    );
  }
}
