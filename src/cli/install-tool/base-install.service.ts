import fs from 'node:fs/promises';
import { inject, injectable } from 'inversify';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services/index.ts';
import { LinkToolService, type ShellWrapperConfig } from '../services/index.ts';
import { NoInitTools, NoPrepareTools } from '../tools/index.ts';
import {
  type InstallToolType,
  type SpawnOptions,
  type SpawnResult,
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
   * Optional tool type for dynamic uninstallation support.
   * Currently `npm`, `gem` or `pip`.
   */
  readonly type?: InstallToolType;

  abstract install(version: string): Promise<void>;

  /**
   * @deprecated Unused
   */
  async isInstalled(version: string): Promise<boolean> {
    return !!(await this.pathSvc.findVersionedToolPath(this.name, version));
  }

  async isInitialized(): Promise<boolean> {
    return await this.pathSvc.isInitialized(this.name);
  }

  async isPrepared(): Promise<boolean> {
    return await this.pathSvc.isPrepared(this.name);
  }

  abstract link(version: string): Promise<void>;

  needsInitialize(): boolean {
    return !NoInitTools.includes(this.name);
  }

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

  test(_version: string): Promise<void> {
    return Promise.resolve();
  }

  toString(): string {
    return this.name;
  }

  async uninstall(version: string): Promise<void> {
    await fs.rm(this.pathSvc.versionedToolPath(this.name, version), {
      recursive: true,
      force: true,
    });
  }

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
   * `filename`.
   *
   * @throws when the list has no checksum for `filename`
   */
  protected async findChecksum(url: string, filename: string): Promise<string> {
    const checksum = (await this.readChecksumFile(url))
      .split('\n')
      .find((l) => l.trimEnd().endsWith(filename))
      ?.split(/\s+/)[0];
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

  protected shellwrapper(options: ShellWrapperConfig): Promise<void> {
    return this._link.shellwrapper(this.name, options);
  }

  protected _spawn(
    command: string,
    args: string[],
    options?: SpawnOptions,
  ): Promise<SpawnResult> {
    return spawn(command, args, { cwd: this.envSvc.tmpDir, ...options });
  }
}
