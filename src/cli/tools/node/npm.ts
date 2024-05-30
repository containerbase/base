import { execa } from 'execa';
import { injectable } from 'inversify';
import { satisfies } from 'semver';
import { logger, parse } from '../../utils';
import { InstallNpmBaseService } from './utils';

@injectable()
export class InstallRenovateService extends InstallNpmBaseService {
  override readonly name: string = 'renovate';

  override prepareEnv(version: string, tmp: string): NodeJS.ProcessEnv {
    const env = super.prepareEnv(version, tmp);

    if (satisfies(version, '<37.234.0')) {
      env.RE2_DOWNLOAD_MIRROR = this.envSvc.replaceUrl(
        'https://github.com/containerbase/node-re2-prebuild/releases/download',
      );
      env.RE2_DOWNLOAD_SKIP_PATH = '1';
    }
    return env;
  }
}

@injectable()
export class InstallYarnService extends InstallNpmBaseService {
  override readonly name: string = 'yarn';

  protected override tool(version: string): string {
    const ver = parse(version);
    if (ver.major >= 2) {
      logger.debug({ version }, 'Using yarnpkg/cli-dist');
      return '@yarnpkg/cli-dist';
    }
    return this.name;
  }

  override async test(): Promise<void> {
    await execa(this.name, ['--version'], { stdio: 'inherit' });
  }
}

@injectable()
export class InstallYarnSlimService extends InstallNpmBaseService {
  override readonly name: string = 'yarn-slim';

  protected override tool(): string {
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
