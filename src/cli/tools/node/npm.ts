import { injectFromHierarchy, injectable } from 'inversify';
import { logger, parse, semverSatisfies } from '../../utils/index.ts';
import { NpmBaseInstallService } from './utils.ts';

@injectable()
@injectFromHierarchy()
export class RenovateInstallService extends NpmBaseInstallService {
  override readonly name: string = 'renovate';

  override prepareEnv(version: string, tmp: string): NodeJS.ProcessEnv {
    const env = super.prepareEnv(version, tmp);

    if (semverSatisfies(version, '<37.234.0')) {
      env.RE2_DOWNLOAD_MIRROR = this.envSvc.replaceUrl(
        'https://github.com/containerbase/node-re2-prebuild/releases/download',
      );
      env.RE2_DOWNLOAD_SKIP_PATH = '1';
    }
    return env;
  }
}

@injectable()
@injectFromHierarchy()
export class NubInstallService extends NpmBaseInstallService {
  override readonly name: string = 'nub';

  // The tool is `nub`, but it ships on npm under the scoped package
  // `@nubjs/nub` (with per-platform binary optionalDependencies), so the
  // install target differs from the tool name.
  protected override tool(): string {
    return '@nubjs/nub';
  }

  override async test(): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}

@injectable()
@injectFromHierarchy()
export class YarnInstallService extends NpmBaseInstallService {
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
    await this._spawn(this.name, ['--version']);
  }
}

@injectable()
@injectFromHierarchy()
export class YarnSlimInstallService extends NpmBaseInstallService {
  override readonly name: string = 'yarn-slim';

  protected override tool(): string {
    return 'yarn';
  }

  override async install(version: string): Promise<void> {
    await super.install(version);
    const node = await this.getNodeVersion();
    // TODO: replace with javascript
    const prefix = this.pathSvc.versionedToolPath(this.name, version);
    await this._spawn('sed', [
      '-i',
      's/ steps,/ steps.slice(0,1),/',
      `${prefix}/${node}/node_modules/yarn/lib/cli.js`,
    ]);
  }
}
