import { injectFromHierarchy, injectable } from 'inversify';
import {
  type Arch,
  logger,
  parse,
  semverSatisfies,
} from '../../utils/index.ts';
import { NpmBaseInstallService } from './utils.ts';

@injectable()
@injectFromHierarchy()
export class RenovateInstallService extends NpmBaseInstallService {
  override readonly name: string = 'renovate';

  /**
   * Points old renovate versions to the containerbase re2 prebuilds, as they
   * build re2 on install.
   */
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

/**
 * The npm package a yarn major version is published as: the native musl build
 * from v6, the cli dist from v2, else `yarn`.
 * @param major - the yarn major version
 * @param arch - the architecture of the native build
 * @returns the npm package name
 */
export function yarnPackage(major: number, arch: Arch): string {
  if (major >= 6) {
    return `@yarnpkg/yarn-${arch === 'arm64' ? 'aarch64' : 'x86_64'}-unknown-linux-musl`;
  }
  if (major >= 2) {
    return '@yarnpkg/cli-dist';
  }
  return 'yarn';
}

@injectable()
@injectFromHierarchy()
export class YarnInstallService extends NpmBaseInstallService {
  override readonly name: string = 'yarn';

  /** The npm package to install, see {@link yarnPackage}. */
  protected override tool(version: string): string {
    const tool = yarnPackage(parse(version).major, this.envSvc.arch);
    logger.debug({ version, tool }, 'Using yarn package');
    return tool;
  }

  /** Checks that `yarn --version` runs. */
  override async test(): Promise<void> {
    await this._spawn(this.name, ['--version']);
  }
}

@injectable()
@injectFromHierarchy()
export class YarnSlimInstallService extends NpmBaseInstallService {
  override readonly name: string = 'yarn-slim';

  /** Installs the `yarn` npm package. */
  protected override tool(): string {
    return 'yarn';
  }

  /** Installs yarn and patches it to skip the slow install steps. */
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
