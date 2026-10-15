import { join } from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { BasePrepareService } from '../../prepare-tool/base-prepare.service.ts';
import { AptService } from '../../services/index.ts';
import { logger, semverGte } from '../../utils/index.ts';
import {
  PrebuildInstallService,
  PrebuildVersionResolver,
} from '../utils/prebuild.ts';

/**
 * The oldest git minor that still gets security fixes and the first version
 * of the containerbase git prebuilds, published as the minimum version. It is
 * above the 2.33.0 renovate needs.
 * https://github.com/renovatebot/renovate/blob/main/lib/util/git/index.ts#L180
 */
const minVersion = '2.48.0';

/**
 * The libraries the git prebuild links against on every ubuntu release, and
 * the packages ubuntu's git pulled in, kept for compatibility until the next
 * major, see #7821.
 */
const commonPackages = [
  'ca-certificates',
  'libexpat1',
  'libpcre2-8-0',
  'zlib1g',
  // compatibility, see #7821
  'git-man',
  'liberror-perl',
  'perl',
];

/**
 * The distro specific libraries the git prebuild links against, and the curl
 * library ubuntu's git pulled in, kept for compatibility until the next
 * major, see #7821.
 */
const distroPackages: Record<string, string[] | undefined> = {
  jammy: ['libcurl4', 'libssl3', 'libcurl3-gnutls'],
  noble: ['libcurl4t64', 'libssl3t64', 'libcurl3t64-gnutls'],
  resolute: ['libcurl4t64', 'libssl3t64', 'libcurl3t64-gnutls'],
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
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name = 'git';

  override readonly needsRoot = true;

  override readonly minVersion = minVersion;

  /** Other tools depend on git, so it can't be uninstalled. */
  override readonly canUninstall = false;

  /**
   * Installs the apt packages the prebuild needs, also when the image was
   * prepared before git came from the prebuild, then the prebuild itself.
   *
   * @throws on an unsupported distro
   */
  override async install(version: string): Promise<void> {
    await this.aptSvc.installDistroPackages(
      this.name,
      distroPackages,
      ...commonPackages,
    );
    await super.install(version);
  }

  /**
   * Symlinks the git binaries into the global bin folder. git needs no
   * containerbase env and finds its own files through its real path, and a
   * shell wrapper would neither forward signals nor keep the caller's env.
   *
   * Also links them into `/usr/bin`, where ubuntu's git put them, pointing to
   * the `/usr/local/bin` links, so a version switch follows. Existing files,
   * like an ubuntu git installed before, are kept. These links stay for
   * compatibility until the next major, see #7822.
   */
  override async link(version: string): Promise<void> {
    const srcDir = join(
      this.pathSvc.versionedToolPath(this.name, version),
      'bin',
    );
    const usrBin = join(this.envSvc.rootDir, 'usr/bin');
    const usrLocalBin = join(this.envSvc.rootDir, 'usr/local/bin');
    for (const name of binaries) {
      await this.symlink({ srcDir, name });
      await this.pathSvc.createSymlink(
        join(usrLocalBin, name),
        join(usrBin, name),
      );
    }
  }

  /**
   * Marks every repository as safe, whoever owns it, in the system wide
   * `/etc/gitconfig`.
   */
  override async postInstall(_version: string): Promise<void> {
    // flutter workaround
    await this._spawn(this.name, ['config', '--system', 'safe.directory', '*']);
  }

  /**
   * Only versions from the first prebuild on can be installed. The version
   * resolver already replaces older ones with the newest prebuild.
   */
  override async validate(version: string): Promise<boolean> {
    return (await super.validate(version)) && semverGte(version, minVersion);
  }
}

@injectable()
@injectFromHierarchy()
export class GitVersionResolver extends PrebuildVersionResolver {
  readonly tool = 'git';

  /**
   * Resolves a version:
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
