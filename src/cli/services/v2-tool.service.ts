import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bindingScopeValues,
  inject,
  injectable,
  postConstruct,
} from 'inversify';
import { logger } from '../utils/index.ts';
import { PathService } from './path.service.ts';

@injectable(bindingScopeValues.Singleton)
export class V2ToolService {
  private readonly _hasPostinstall: Record<string, boolean> = {};
  private readonly _hasUninstall: Record<string, boolean> = {};
  private readonly _needsInit: Record<string, boolean> = {};
  private readonly _needsPrep: Record<string, boolean> = {};

  @inject(PathService)
  protected readonly pathSvc!: PathService;

  /** Scans every v2 shell tool for the optional functions it defines. */
  @postConstruct()
  protected async [Symbol('_construct')](): Promise<void> {
    const tools = await this.pathSvc.findLegacyTools();
    for (const tool of tools) {
      const content = await readFile(
        join(this.pathSvc.usrPath, 'tools/v2', `${tool}.sh`),
        { encoding: 'utf8' },
      );

      this._hasPostinstall[tool] = /\s+function\s+post_install\s*\(/.test(
        content,
      );

      this._hasUninstall[tool] = /\s+function\s+uninstall_tool\s*\(/.test(
        content,
      );
      this._needsPrep[tool] = /\s+function\s+prepare_tool\s*\(/.test(content);
      this._needsInit[tool] = /\s+function\s+init_tool\s*\(/.test(content);
    }

    logger.trace(
      {
        init: this._needsInit,
        prep: this._needsPrep,
        uninstall: this._hasUninstall,
      },
      'V2ToolService.construct',
    );
  }

  /**
   * Whether the v2 shell tool defines `post_install`.
   *
   * @throws for an unknown tool
   */
  hasPostinstall(tool: string): boolean {
    if (this._hasPostinstall[tool] === undefined) {
      throw new Error(`tool not supported: ${tool}`);
    }
    return this._hasPostinstall[tool];
  }

  /**
   * Whether the v2 shell tool defines `uninstall_tool`.
   *
   * @throws for an unknown tool
   */
  hasUninstall(tool: string): boolean {
    if (this._hasUninstall[tool] === undefined) {
      throw new Error(`tool not supported: ${tool}`);
    }
    return this._hasUninstall[tool];
  }

  /**
   * Whether the v2 shell tool defines `prepare_tool`.
   *
   * @throws for an unknown tool
   */
  needsPrepare(tool: string): boolean {
    if (this._needsPrep[tool] === undefined) {
      throw new Error(`tool not supported: ${tool}`);
    }
    return this._needsPrep[tool];
  }

  /**
   * Whether the v2 shell tool defines `init_tool`.
   *
   * @throws for an unknown tool
   */
  needsInitialize(tool: string): boolean {
    if (this._needsInit[tool] === undefined) {
      throw new Error(`tool not supported: ${tool}`);
    }
    return this._needsInit[tool];
  }
}
