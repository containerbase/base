import fs from 'node:fs/promises';
import { inject, injectable } from 'inversify';
import type { ToolFile } from '../../../packages/base/src/tool-versions-types.ts';
import {
  type HttpChecksumType,
  HttpChecksumTypes,
} from '../services/http.service.ts';
import {
  CompressionService,
  EnvService,
  HttpService,
  LinkToolService,
  PathService,
  type ShellWrapperConfig,
  ToolVersionsService,
} from '../services/index.ts';
import { NoInitTools, NoPrepareTools } from '../tools/index.ts';
import {
  type DistroCode,
  type SpawnOptions,
  type SpawnResult,
  type ToolType,
  getDistro,
  isValid,
  logger,
  spawn,
} from '../utils/index.ts';

@injectable()
export abstract class BaseInstallService {
  @inject(PathService)
  protected readonly pathSvc!: PathService;
  @inject(EnvService)
  protected readonly envSvc!: EnvService;
  @inject(HttpService)
  protected readonly http!: HttpService;
  @inject(CompressionService)
  protected readonly compress!: CompressionService;

  @inject(LinkToolService)
  private readonly _link!: LinkToolService;
  @inject(ToolVersionsService)
  private readonly _toolVersions!: ToolVersionsService;

  /**
   * Optional tool alias used to refer to this tool as parent.
   */
  get alias(): string {
    return this.name;
  }

  /**
   * Tool name
   */
  abstract readonly name: string;

  /**
   * A tool can depend on another tool to work.
   * Eg. composer depends on php.
   */
  readonly parent?: string;

  /**
   * Some tools can only be installed as root, so they are only available at
   * image build time. Eg. git is installed via apt.
   */
  readonly needsRoot: boolean = false;

  /**
   * Tools which are not installed into a versioned tool path can't be
   * uninstalled, eg. git is installed system wide via apt.
   */
  readonly canUninstall: boolean = true;

  /**
   * The package manager installing the tool, published as `type` in the base
   * package metadata.
   */
  readonly type?: ToolType;

  /**
   * The oldest version containerbase supports for the tool, in the tool's
   * versioning, on the default distro, published as `minVersion` in the base
   * package metadata. Tools without a known limit have none.
   */
  readonly minVersion?: string;

  /**
   * The oldest version supported on an Ubuntu release, for the releases whose
   * floor differs from `minVersion`, the floor on the default distro,
   * published as `distroMinVersion` in the base package metadata.
   */
  readonly distroMinVersion?: Partial<Record<DistroCode, string>>;

  /** Downloads and installs the version into the versioned tool path. */
  abstract install(version: string): Promise<void>;

  /**
   * @deprecated Unused
   */
  async isInstalled(version: string): Promise<boolean> {
    return !!(await this.pathSvc.findVersionedToolPath(this.name, version));
  }

  /** Whether the tool was already initialized in this container. */
  async isInitialized(): Promise<boolean> {
    return await this.pathSvc.isInitialized(this.name);
  }

  /** Whether the tool was already prepared in this image. */
  async isPrepared(): Promise<boolean> {
    return await this.pathSvc.isPrepared(this.name);
  }

  /** Links the binaries of the installed version into the global bin folder. */
  abstract link(version: string): Promise<void>;

  /** Whether the tool has an initialize step, see `NoInitTools`. */
  needsInitialize(): boolean {
    return !NoInitTools.includes(this.name);
  }

  /** Whether the tool has a prepare step, see `NoPrepareTools`. */
  needsPrepare(): boolean {
    return !NoPrepareTools.includes(this.name);
  }

  /**
   * Post-installation steps.
   * Used for relinking executables.
   * @param version Version that was installed
   */
  postInstall(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Does nothing by default. Tools override it to check that the installed
   * version runs.
   */
  test(_version: string): Promise<void> {
    return Promise.resolve();
  }

  /** The tool name, for logging. */
  toString(): string {
    return this.name;
  }

  /** Removes the versioned tool path of the version. */
  async uninstall(version: string): Promise<void> {
    await fs.rm(this.pathSvc.versionedToolPath(this.name, version), {
      recursive: true,
      force: true,
    });
  }

  /** Whether the version can be installed, by default any semver version. */
  validate(version: string): Promise<boolean> {
    return Promise.resolve(isValid(version));
  }

  /**
   * Downloads a checksum file for a single file, eg. `tool.tar.gz.sha256`,
   * and returns its checksum. A filename after the checksum is ignored.
   *
   * @throws when the file has no checksum
   */
  protected async getChecksum(url: string): Promise<string> {
    const checksum = (await this.readChecksumFile(url)).trim().split(/\s+/)[0];
    if (!checksum) {
      throw new Error(`Checksum not found in ${url}`);
    }
    return checksum;
  }

  /**
   * Downloads a checksum list like `SHA256SUMS`, which has one
   * `<checksum>  <filename>` line per file, and returns the checksum of
   * `filename`. The filename must match exactly, ignoring the binary mode
   * `*` and a leading `./`.
   *
   * @throws when the list has no checksum for `filename`
   */
  protected async findChecksum(url: string, filename: string): Promise<string> {
    const checksum = (await this.readChecksumFile(url))
      .split('\n')
      .map((l) => l.trim().split(/\s+/))
      .find(([, name]) => name?.replace(/^\*?(?:\.\/)?/, '') === filename)?.[0];
    if (!checksum) {
      throw new Error(`Checksum not found in ${url} for ${filename}`);
    }
    return checksum;
  }

  /**
   * Downloads a checksum file and returns its text without a leading BOM.
   * Files starting with a UTF-16LE BOM, like the PowerShell `hashes.sha256`,
   * are decoded as UTF-16LE, all others as UTF-8.
   */
  private async readChecksumFile(url: string): Promise<string> {
    const buf = await fs.readFile(await this.http.download({ url }));
    const text =
      buf[0] === 0xff && buf[1] === 0xfe
        ? buf.toString('utf16le')
        : buf.toString('utf8');
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }

  /**
   * Downloads the file of a version for the host from the tool-versions data,
   * verified against its checksum. Url replacements and the cache apply.
   *
   * @param distro - the distro codename to pick the file for, by default the
   * host's
   * @returns the downloaded file, or `undefined` when there is no data, no
   * file for the host or no supported checksum, so the installer can use its
   * own download logic
   * @throws when the download fails
   */
  protected async downloadToolFile(
    version: string,
    distro?: string,
  ): Promise<string | undefined> {
    const data = await this._toolVersions.getVersionFiles(this.name, version);
    if (!data) {
      return undefined;
    }
    const code = distro ?? (await getDistro()).versionCode;
    // never download without verification: the files of the host with an
    // algorithm the http service doesn't know are skipped before the pick, so
    // a more specific one can't hide a usable file
    const usable = data.files
      .filter((f) => fitsHost(f, this.envSvc.arch, code))
      .filter((f) => {
        if (parseChecksum(f.checksum)) {
          return true;
        }
        logger.warn(
          { tool: this.name, version, checksum: f.checksum },
          'unsupported tool-versions file checksum',
        );
        return false;
      });
    const file = selectToolFile(usable, this.envSvc.arch, code);
    if (!file) {
      logger.debug(
        { tool: this.name, version, arch: this.envSvc.arch, distro: code },
        'no tool-versions file for the host',
      );
      return undefined;
    }
    const { type, value } = parseChecksum(file.checksum)!;
    return await this.http.download({
      url: file.url,
      checksumType: type,
      expectedChecksum: value,
    });
  }

  /** Creates a shell wrapper in the global bin folder for a tool binary. */
  protected shellwrapper(options: ShellWrapperConfig): Promise<void> {
    return this._link.shellwrapper(this.name, options);
  }

  /**
   * Links a tool binary into the global bin folder with a plain symlink, for
   * binaries which need no containerbase env, see `LinkToolService.symlink`.
   */
  protected symlink(
    options: Pick<ShellWrapperConfig, 'name' | 'srcDir'>,
  ): Promise<void> {
    return this._link.symlink(this.name, options);
  }

  /** Runs a command, by default in the temp folder. */
  protected _spawn(
    command: string,
    args: string[],
    options?: SpawnOptions,
  ): Promise<SpawnResult> {
    return spawn(command, args, { cwd: this.envSvc.tmpDir, ...options });
  }
}

/**
 * Splits a `<algorithm>:<hex>` checksum of the tool-versions data.
 * @returns `undefined` for an algorithm the http service can't verify
 */
function parseChecksum(
  checksum: string,
): { type: HttpChecksumType; value: string } | undefined {
  const [algorithm, value] = checksum.split(':');
  const type = HttpChecksumTypes.find((t) => t === algorithm);
  return type && value ? { type, value } : undefined;
}

/**
 * Whether a file fits a host: of its arch or for any arch, and of its distro
 * or for any distro.
 */
function fitsHost(file: ToolFile, arch: string, distro: string): boolean {
  return (
    (!file.arch || file.arch === arch) &&
    (!file.distro || file.distro === distro)
  );
}

/**
 * Picks the file for a host from the files of a version: one of the arch or
 * for any arch, and of the distro or for any distro. An arch or distro
 * specific file is preferred over a generic one, the first one wins a tie.
 * @returns `undefined` when no file fits the host
 */
export function selectToolFile(
  files: readonly ToolFile[],
  arch: string,
  distro: string,
): ToolFile | undefined {
  let best: ToolFile | undefined;
  let bestScore = -1;
  for (const file of files) {
    if (!fitsHost(file, arch, distro)) {
      continue;
    }
    const score = (file.arch ? 1 : 0) + (file.distro ? 1 : 0);
    if (score > bestScore) {
      best = file;
      bestScore = score;
    }
  }
  return best;
}
