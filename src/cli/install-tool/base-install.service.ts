import fs from 'node:fs/promises';
import { inject, injectable } from 'inversify';
import type { ToolFile } from '../../../packages/base/src/tool-versions-types.ts';
import {
  type HttpChecksumType,
  urlFileName,
} from '../services/http.service.ts';
import {
  CompressionService,
  EnvService,
  HttpService,
  LinkToolService,
  PathService,
  type ShellWrapperConfig,
  ToolFilesService,
} from '../services/index.ts';
import { NoInitTools, NoPrepareTools } from '../tools/index.ts';
import {
  type DistroCode,
  type SpawnOptions,
  type SpawnResult,
  type ToolType,
  isValid,
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
  @inject(ToolFilesService)
  private readonly _toolFiles!: ToolFilesService;

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
   * The cache folders of the tool, relative to `PathService.cachePath`, eg.
   * `.cargo/registry`, which `cleanup cache` removes. Only folders holding
   * data the tool downloads again, never config files.
   */
  readonly cacheDirs: readonly string[] = [];

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
   * Downloads a file of a release folder: the file named `filename` of the
   * tool-versions data, see {@link downloadToolFile}, else the file of the
   * folder, verified against its sha256 in a checksum list of the same folder,
   * see {@link findChecksum}.
   *
   * @param baseUrl - the url of the folder, with a trailing slash
   * @param filename - the file to download, also its name in the data
   * @param list - the file name of the checksum list, like `SHA256SUMS`
   * @throws when the list has no checksum for `filename` or the download fails
   */
  protected async downloadChecksumListed(
    version: string,
    baseUrl: string,
    filename: string,
    list: string,
  ): Promise<string> {
    const file = await this.downloadNamedToolFile(version, filename);
    if (file) {
      return file;
    }
    const expectedChecksum = await this.findChecksum(
      `${baseUrl}${list}`,
      filename,
    );
    return await this.http.download({
      url: `${baseUrl}${filename}`,
      checksumType: 'sha256',
      expectedChecksum,
    });
  }

  /**
   * Downloads a file: the file named like it of the tool-versions data, see
   * {@link downloadToolFile}, else the file, verified against the checksum in
   * its sidecar file, eg. `tool.tar.gz.sha256`, see {@link getChecksum}.
   *
   * @param url - the url of the file
   * @param sidecar - the suffix of the sidecar file, like `.sha256`
   * @param options.checksumType - the algorithm of the checksum
   * @param options.name - the name of the file in the data, also the name of
   * the downloaded file when it's a plain file name, by default the decoded
   * last url segment
   * @throws when the sidecar has no checksum or the download fails
   */
  protected async downloadChecksumSidecar(
    version: string,
    url: string,
    sidecar: string,
    {
      checksumType = 'sha256',
      name,
    }: { checksumType?: HttpChecksumType; name?: string } = {},
  ): Promise<string> {
    const file = await this.downloadNamedToolFile(
      version,
      name ?? urlFileName(url),
    );
    if (file) {
      return file;
    }
    const expectedChecksum = await this.getChecksum(`${url}${sidecar}`);
    return await this.http.download({
      url,
      checksumType,
      expectedChecksum,
      fileName: name,
    });
  }

  /**
   * Downloads a file of a release without an upstream checksum: the file
   * named `name` of the tool-versions data, by default the last url segment,
   * which has a checksum computed by the data, see {@link downloadToolFile},
   * else the file unverified.
   *
   * @param url - the url of the file
   * @param name - the name of the file in the data, also the name of the
   * downloaded file when it's a plain file name, by default the decoded last
   * url segment
   * @throws when the download fails
   */
  protected async downloadWithoutChecksum(
    version: string,
    url: string,
    name?: string,
  ): Promise<string> {
    return (
      (await this.downloadNamedToolFile(version, name ?? urlFileName(url))) ??
      (await this.http.download({ url, fileName: name }))
    );
  }

  /**
   * Downloads the file named `name` of a version of the tool for the host
   * from the tool-versions data, see
   * {@link ToolFilesService.downloadNamedToolFile}.
   */
  protected async downloadNamedToolFile(
    version: string,
    name: string,
  ): Promise<string | undefined> {
    return await this._toolFiles.downloadNamedToolFile(
      this.name,
      version,
      name,
    );
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
   * Downloads the file of a version of the tool for the host from the
   * tool-versions data, see {@link ToolFilesService.downloadToolFile}.
   *
   * @param distro - the distro codename to pick the file for, by default the
   * host's
   * @param filter - only picks from the files it accepts, by default all
   * @returns the downloaded file, or `undefined` when there is no data or no
   * file for the host with a supported checksum, so the installer can use its
   * own download logic
   * @throws when the download fails
   */
  protected async downloadToolFile(
    version: string,
    distro?: string,
    filter?: (file: ToolFile) => boolean,
  ): Promise<string | undefined> {
    return await this._toolFiles.downloadToolFile(
      this.name,
      version,
      distro,
      filter,
    );
  }

  /**
   * Picks the file of a version of the tool for the host from the
   * tool-versions data, see {@link ToolFilesService.findToolFile}.
   *
   * @param distro - the distro codename to pick the file for, by default the
   * host's
   * @param filter - only picks from the files it accepts, by default all
   * @returns `undefined` when there is no data, else the file, if any, and
   * the distro codename it was picked for
   */
  protected async findToolFile(
    version: string,
    distro?: string,
    filter?: (file: ToolFile) => boolean,
  ): Promise<{ file: ToolFile | undefined; distro: string } | undefined> {
    return await this._toolFiles.findToolFile(
      this.name,
      version,
      distro,
      filter,
    );
  }

  /**
   * Downloads a file picked by {@link findToolFile}, see
   * {@link ToolFilesService.downloadListedFile}.
   *
   * @throws when the download fails
   */
  protected async downloadListedFile(file: ToolFile): Promise<string> {
    return await this._toolFiles.downloadListedFile(file);
  }

  /**
   * Downloads the file of a version of the tool for the host distro, else for
   * `fallback`, from the tool-versions data, see
   * {@link ToolFilesService.downloadDistroToolFile}.
   *
   * @param host - the codename of the host distro
   * @param fallback - the codename to try when the host has no file
   * @returns the downloaded file, or `undefined` when neither has a file
   * @throws when the download fails
   */
  protected async downloadDistroToolFile(
    version: string,
    host: string,
    fallback: string,
  ): Promise<string | undefined> {
    return await this._toolFiles.downloadDistroToolFile(
      this.name,
      version,
      host,
      fallback,
    );
  }

  /**
   * Downloads a file when its sidecar file exists, verified against the
   * checksum in it, see {@link getChecksum}. For releases which may lack the
   * file, so the installer can fall back to another source. It doesn't use
   * the tool-versions data, combine it with {@link downloadNamedToolFile}.
   *
   * @param url - the url of the file
   * @param sidecar - the suffix of the sidecar file, like `.sha512`
   * @param checksumType - the algorithm of the checksum
   * @returns `undefined` when there is no sidecar file
   * @throws when the sidecar has no checksum or the download fails
   */
  protected async downloadOptionalChecksumSidecar(
    url: string,
    sidecar: string,
    checksumType: HttpChecksumType,
  ): Promise<string | undefined> {
    const checksumUrl = `${url}${sidecar}`;
    if (!(await this.http.exists(checksumUrl))) {
      return undefined;
    }
    const expectedChecksum = await this.getChecksum(checksumUrl);
    return await this.http.download({ url, checksumType, expectedChecksum });
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
