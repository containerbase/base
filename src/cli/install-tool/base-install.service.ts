import { inject, injectable } from 'inversify';
import {
  CompressionService,
  EnvService,
  HttpService,
  PathService,
} from '../services';
import { NoInitTools, NoPrepareTools } from '../tools';
import { isValid } from '../utils';
import { LinkToolService, type ShellWrapperConfig } from './link-tool.service';

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

  abstract install(version: string): Promise<void>;

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
   * Post-installation steps
   * @param _version Version that was installed
   * @deprecated Link check is now smart enough to not need this
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

  validate(version: string): Promise<boolean> {
    return Promise.resolve(isValid(version));
  }

  protected shellwrapper(options: ShellWrapperConfig): Promise<void> {
    return this._link.shellwrapper(this.name, options);
  }
}
