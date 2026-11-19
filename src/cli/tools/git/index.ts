import fs from 'node:fs/promises';
import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { fileContent, logger, semverGte } from '../../utils/index.ts';
import {
  PrebuildInstallService,
  PrebuildVersionResolver,
} from '../utils/prebuild.ts';

/**
 * The deb registered for the installed git.
 */
const packageName = 'containerbase-git';

/** The epoch of ubuntu's git versions, eg. `1:2.43.0-1ubuntu7`. */
const gitEpoch = '1:';

/**
 * The apt config which lets maintainer scripts find the installed git,
 * relative to the root folder.
 */
const aptConfig = `etc/apt/apt.conf.d/${packageName}`;

/**
 * The oldest git minor that still gets security fixes and the first version
 * of the containerbase git prebuilds, published as the minimum version. It is
 * above the 2.33.0 renovate needs.
 * https://github.com/renovatebot/renovate/blob/main/lib/util/git/index.ts#L180
 */
const minVersion = '2.48.0';

/** The libraries the git prebuild links against on every ubuntu release. */
const commonPackages = [
  'ca-certificates',
  'libexpat1',
  'libpcre2-8-0',
  'zlib1g',
];

/**
 * The distro specific libraries the git prebuild links against: the GnuTLS
 * curl, as the noble prebuilds are built without OpenSSL.
 */
const distroPackages: Record<string, string[] | undefined> = {
  noble: ['libcurl3t64-gnutls'],
  resolute: ['libcurl3t64-gnutls'],
};

/**
 * The binaries ubuntu's git package puts on the path, without the
 * `git-cvsserver` stub of the perl-less prebuild.
 */
const binaries = [
  'git',
  'git-receive-pack',
  'git-shell',
  'git-upload-archive',
  'git-upload-pack',
  'scalar',
];

@injectable()
@injectFromHierarchy()
export class GitPrepareService extends BasePrepareService {
  override readonly name = 'git';

  /**
   * Installs the apt packages the git prebuild needs on the current ubuntu
   * release.
   *
   * @throws on an unsupported distro
   */
  override async prepare(): Promise<void> {
    await this.installDistroPackages(distroPackages, ...commonPackages);
  }
}

@injectable()
@injectFromHierarchy()
export class GitInstallService extends PrebuildInstallService {
  override readonly name = 'git';

  override readonly needsRoot = true;

  override readonly minVersion = minVersion;

  /** Other tools depend on git, so it can't be uninstalled. */
  override readonly canUninstall = false;

  /**
   * Installing the files of a version again, eg. on a volume at
   * `/opt/containerbase`, needs no root: the apt packages and the system wide
   * files of `postInstall` stay in the image.
   */
  override get restoreNeedsRoot(): boolean {
    return false;
  }

  /** The git prebuilds for jammy lack fixes, noble and newer use noble ones. */
  protected override readonly fallbackDistro = 'noble';

  /** The `bin` folder of the version. */
  private binDir(version: string): string {
    return join(this.pathSvc.versionedToolPath(this.name, version), 'bin');
  }

  /**
   * Links the git binaries with shell wrappers, like every other tool, so a
   * missing version is installed again on its next call. `keepArgv0` is for
   * the `exec` it adds, so a signal sent to the command reaches git and not
   * the wrapper's bash. The wrappers run the binaries by their path in the
   * version folder, so git finds `libexec/git-core` through its real path.
   */
  override async link(version: string): Promise<void> {
    const srcDir = this.binDir(version);
    for (const name of binaries) {
      await this.shellwrapper({ srcDir, name, keepArgv0: true });
    }
  }

  /**
   * Marks every repository as safe, whoever owns it, in the system wide
   * `/etc/gitconfig`, and provides the installed git to apt and its
   * maintainer scripts. git runs by its path, as the command has no pointer
   * before the install records its links. A restore skips all of it, as
   * these files are outside of `/opt/containerbase` and stay in the image.
   */
  override async postInstall(version: string): Promise<void> {
    if (this.isRestoring()) {
      return;
    }
    // flutter workaround
    await this._spawn(join(this.binDir(version), this.name), [
      'config',
      '--system',
      'safe.directory',
      '*',
    ]);
    await this.addAptPath();
    await this.registerPackage(version);
  }

  /**
   * Appends `/usr/local/bin` to the `PATH` apt runs dpkg and the maintainer
   * scripts with, which is `/usr/sbin:/usr/bin:/sbin:/bin` by default, so
   * scripts calling `git`, like the one of ubuntu's `git-lfs`, find the
   * installed git. It comes last, so ubuntu's own binaries still win.
   */
  private async addAptPath(): Promise<void> {
    await fs.writeFile(
      join(this.envSvc.rootDir, aptConfig),
      'DPkg::Path "/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bin";\n',
    );
  }

  /**
   * Only versions from the first prebuild on can be installed. The version
   * resolver already replaces older ones with the newest prebuild.
   */
  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, minVersion);
  }

  /**
   * Builds and installs an empty deb which provides the `git` package in the
   * installed version, so apt packages depending on git use the prebuild.
   */
  private async registerPackage(version: string): Promise<void> {
    await this.pathSvc.withTempDir(`${packageName}-`, async (tmp) => {
      const root = join(tmp, packageName);
      const control = join(root, 'DEBIAN');
      await fs.mkdir(control, { recursive: true });
      // dpkg-deb rejects control folders outside 0755-0775, whatever the umask
      await fs.chmod(root, 0o755);
      await fs.chmod(control, 0o755);
      await fs.writeFile(
        join(control, 'control'),
        fileContent`
          Package: ${packageName}
          Version: ${version}
          Architecture: all
          Maintainer: containerbase <https://github.com/containerbase/base>
          Provides: git (= ${gitEpoch}${version})
          Description: git installed by containerbase
           Provides the git package for the git containerbase installed.
        `,
      );
      const deb = `${root}.deb`;
      await this._spawn('dpkg-deb', [
        '--build',
        '--root-owner-group',
        root,
        deb,
      ]);
      await this._spawn('dpkg', ['--install', deb]);
    });
  }
}

@injectable()
@injectFromHierarchy()
export class GitVersionResolver extends PrebuildVersionResolver {
  readonly tool = 'git';

  /**
   * Resolves a version the tool-versions data has no match for, see
   * {@link dataField}:
   *
   * - A missing version or `latest` resolves to the newest prebuild.
   * - A full `X.Y.Z` version from the first prebuild on is kept without any
   *   request; a release without a prebuild fails the download.
   * - Any other version, like a partial `2.50`, a version before the first
   *   prebuild or a vendor version like `2.43.0-1ubuntu1`, resolves to the
   *   newest prebuild, with a warning, so the version which is installed and
   *   recorded is the real one.
   */
  override async resolve(
    version: string | undefined,
  ): Promise<string | undefined> {
    if (!isNonEmptyStringAndNotWhitespace(version) || version === 'latest') {
      return await super.resolve(version);
    }

    if (/^\d+\.\d+\.\d+$/.test(version) && semverGte(version, minVersion)) {
      return version;
    }

    const latest = await this.latestVersion();
    logger.warn(
      `No git ${version} prebuild, installing the newest git ${latest} instead`,
    );
    return latest;
  }
}
