import { join } from 'node:path';
import { inject, injectFromHierarchy, injectable } from 'inversify';
import { z } from 'zod';
import { BaseInstallService } from '../install-tool/base-install.service.ts';
import { BasePrepareService } from '../prepare-tool/base-prepare.service.ts';
import { AptService } from '../services/index.ts';
import { parse } from '../utils/index.ts';

@injectable()
@injectFromHierarchy()
export class GolangPrepareService extends BasePrepareService {
  @inject(AptService)
  private readonly aptSvc!: AptService;

  override readonly name = 'golang';

  /**
   * Installs the apt packages go suggests for its vcs imports, then
   * initializes the cache and links `~/go` to it.
   */
  override async prepare(): Promise<void> {
    await this.aptSvc.install('bzr', 'mercurial');

    await this.initialize();

    await this.pathSvc.createSymlink(
      join(this.pathSvc.cachePath, 'go'),
      join(this.envSvc.userHome, 'go'),
    );
  }

  /** Creates the `src`, `bin` and `pkg` folders in the containerbase cache. */
  override async initialize(): Promise<void> {
    const goPath = join(this.pathSvc.cachePath, 'go');

    await this.pathSvc.createDir(join(goPath, 'src'));
    await this.pathSvc.createDir(join(goPath, 'bin'));
    await this.pathSvc.createDir(join(goPath, 'pkg'));
  }
}

/** A single file listed for a go.dev release. */
const GoDevFile = z.object({
  os: z.string(),
  arch: z.string(),
  sha256: z.string(),
});

/** A go.dev release, as returned by `?mode=json&include=all`. */
const GoDevRelease = z.object({
  version: z.string(),
  files: z.array(GoDevFile),
});

const GoDevReleases = z.array(GoDevRelease);

@injectable()
@injectFromHierarchy()
export class GolangInstallService extends BaseInstallService {
  override readonly name = 'golang';

  /** The architecture name used by the containerbase prebuild. */
  private get prebuildArch(): string {
    return this.envSvc.arch === 'arm64' ? 'aarch64' : 'x86_64';
  }

  /**
   * Downloads the containerbase prebuild, verified against its `.sha512`,
   * and extracts it into the tool path. Not all releases are copied to the
   * prebuild repo yet, eg. a version just released upstream, so this falls
   * back to the official build when there is no prebuild.
   */
  override async install(version: string): Promise<void> {
    const base = `https://github.com/containerbase/${this.name}-prebuild/releases/download/${version}/${this.name}-${version}-${this.prebuildArch}.tar.xz`;

    if (await this.http.exists(`${base}.sha512`)) {
      const expectedChecksum = await this.getChecksum(`${base}.sha512`);
      const file = await this.http.download({
        url: base,
        checksumType: 'sha512',
        expectedChecksum,
      });

      const path = await this.pathSvc.ensureToolPath(this.name);
      // the archive already contains the version folder itself
      await this.compress.extract({ file, cwd: path });
      return;
    }

    await this.installOfficial(version);
  }

  /**
   * Downloads the official build from dl.google.com, verified against the
   * sha256 checksum published on go.dev, and extracts it into the versioned
   * tool path.
   *
   * @throws when go.dev has no checksum for the version and architecture
   */
  private async installOfficial(version: string): Promise<void> {
    const { major, minor, patch } = parse(version);
    // before 1.21 the first release of a minor version was published as
    // `major.minor`, eg. `go1.20`, since 1.21 it is `go1.21.0`
    const fversion =
      (major < 1 || (major === 1 && minor < 21)) && patch === 0
        ? `${major}.${minor}`
        : version;
    const arch = this.envSvc.arch;

    const releasesUrl = 'https://go.dev/dl/?mode=json&include=all';
    const releases = GoDevReleases.parse(await this.http.getJson(releasesUrl));
    const file = releases
      .find((release) => release.version === `go${fversion}`)
      ?.files.find((f) => f.os === 'linux' && f.arch === arch);
    if (!file) {
      throw new Error(
        `Checksum not found in ${releasesUrl} for go${fversion} linux/${arch}`,
      );
    }

    const downloaded = await this.http.download({
      url: `https://dl.google.com/go/go${fversion}.linux-${arch}.tar.gz`,
      checksumType: 'sha256',
      expectedChecksum: file.sha256,
    });

    await this.pathSvc.ensureToolPath(this.name);
    const path = await this.pathSvc.createVersionedToolPath(this.name, version);
    await this.compress.extract({ file: downloaded, cwd: path, strip: 1 });
  }

  /** Links the `go` binary into the global bin folder, exporting `GOBIN`. */
  override async link(version: string): Promise<void> {
    await this.shellwrapper({
      name: 'go',
      srcDir: join(this.pathSvc.versionedToolPath(this.name, version), 'bin'),
      exports: `GOBIN=\${GOBIN-${this.pathSvc.binDir}}`,
    });
  }

  /** Checks that `go version` and `go env` run. */
  override async test(_version: string): Promise<void> {
    await this._spawn('go', ['version']);
    await this._spawn('go', ['env']);
  }
}
