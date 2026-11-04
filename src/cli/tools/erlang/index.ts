import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { getDistro } from '../../utils/index.ts';
import { PrebuildInstallService } from '../utils/prebuild.ts';

/**
 * Matches erlang's version format: up to four numeric parts (major, minor,
 * patch, build), an optional `+<build number>` and an optional pre-release
 * suffix starting with a lowercase letter or `-`, eg. `28.5.0.7`. `validate`
 * additionally requires all four numeric parts to be present.
 */
const ERLANG_VERSION_REGEX =
  /^(?<major>0|[1-9][0-9]*)(?:\.(?<minor>0|[1-9][0-9]*))?(?:\.(?<patch>0|[1-9][0-9]*))?(?:\.(?<build>0|[1-9][0-9]*))?(?:\+[0-9]+)?(?:[a-z-].*)?$/;

/** The ubuntu releases erlang can be installed on. */
const supportedDistros = ['jammy', 'noble', 'resolute'];

@injectable()
@injectFromHierarchy()
export class ErlangPrepareService extends BasePrepareService {
  override readonly name = 'erlang';

  /**
   * Links `/usr/local/erlang` to the tool path, a workaround for erlang's
   * hard-coded paths that works for v22+.
   */
  override async prepare(): Promise<void> {
    await this.pathSvc.createSymlink(
      this.pathSvc.toolPath(this.name),
      join(this.envSvc.rootDir, 'usr/local/erlang'),
    );
  }
}

@injectable()
@injectFromHierarchy()
export class ErlangInstallService extends PrebuildInstallService {
  override readonly name = 'erlang';

  /** The first prebuild with jammy assets. */
  override readonly minVersion = '24.2.0.0';

  /**
   * Installs the containerbase prebuild, see `PrebuildInstallService`. Only
   * jammy prebuilds are published, noble and resolute use them too.
   *
   * @throws on an unsupported distro
   */
  override async install(version: string): Promise<void> {
    const { versionCode } = await getDistro();
    if (!supportedDistros.includes(versionCode)) {
      throw new Error(
        `Tool '${this.name}' not supported on: ${versionCode}! Please use ubuntu 'jammy', 'noble' or 'resolute'.`,
      );
    }
    await super.install(version);
  }

  /** Accepts four part versions like `28.5.0.7`. */
  override validate(version: string): Promise<boolean> {
    const groups = ERLANG_VERSION_REGEX.exec(version)?.groups;
    return Promise.resolve(
      !!groups?.major && !!groups.minor && !!groups.patch && !!groups.build,
    );
  }

  /** Links the `erl` binary into the global bin folder. */
  override async link(version: string): Promise<void> {
    await this.shellwrapper({
      name: 'erl',
      srcDir: join(this.pathSvc.versionedToolPath(this.name, version), 'bin'),
    });
    // exporting ERL_ROOTDIR only works for v24+, so it isn't set here
  }

  /** Checks that `erl` runs and prints the installed otp release. */
  override async test(_version: string): Promise<void> {
    await this._spawn('erl', [
      '-eval',
      'erlang:display(erlang:system_info(otp_release)), halt().',
      '-noshell',
    ]);
  }
}
