import { join } from 'node:path';
import { injectFromHierarchy, injectable } from 'inversify';
import { BaseInstallService } from '../../install-tool/base-install.service.ts';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { getDistro, semverCoerce, semverGte } from '../../utils/index.ts';

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
export class ErlangInstallService extends BaseInstallService {
  override readonly name = 'erlang';

  /** The architecture name used by the erlang prebuild archives. */
  private get arch(): string {
    switch (this.envSvc.arch) {
      case 'arm64':
        return 'aarch64';
      case 'amd64':
        return 'x86_64';
    }
  }

  /**
   * Downloads the containerbase prebuild, verified against its `.sha512`
   * since v25.3.0.0, and extracts it into the tool path.
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

    // only jammy prebuilds are published, noble and resolute use them too
    const url = `https://github.com/containerbase/${this.name}-prebuild/releases/download/${version}/${this.name}-${version}-jammy-${this.arch}.tar.xz`;

    // the prebuild repo only started publishing a `.sha512` checksum with v25.3.0.0
    const expectedChecksum = semverGte(semverCoerce(version)!, '25.3.0')
      ? await this.getChecksum(`${url}.sha512`)
      : undefined;

    const file = await this.http.download({
      url,
      checksumType: 'sha512',
      expectedChecksum,
    });

    const path = await this.pathSvc.ensureToolPath(this.name);
    // the archive already contains the version folder itself
    await this.compress.extract({ file, cwd: path });
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
