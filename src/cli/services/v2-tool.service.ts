import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  bindingScopeValues,
  inject,
  injectable,
  postConstruct,
} from 'inversify';
import { logger } from '../utils';
import { isNotKnownV2Tool } from '../utils/v2-tool';
import { PathService } from './path.service';

@injectable(bindingScopeValues.Singleton)
export class V2ToolService {
  private readonly _hasUninstall: Record<string, boolean> = {};
  private readonly _needsInit: Record<string, boolean> = {};
  private readonly _needsPrep: Record<string, boolean> = {};

  @inject(PathService)
  protected readonly pathSvc!: PathService;

  @postConstruct()
  protected async [Symbol('_construct')](): Promise<void> {
    const tools = await this.pathSvc.findLegacyTools();
    for (const tool of tools.filter(isNotKnownV2Tool)) {
      const content = await readFile(
        join(this.pathSvc.usrPath, 'tools/v2', `${tool}.sh`),
        { encoding: 'utf8' },
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
      'construct',
    );
  }

  hasUninstall(tool: string): boolean {
    if (this._hasUninstall[tool] === undefined) {
      throw new Error(`tool not supported: ${tool}`);
    }
    return this._hasUninstall[tool];
  }

  needsPrepare(tool: string): boolean {
    if (this._needsPrep[tool] === undefined) {
      throw new Error(`tool not supported: ${tool}`);
    }
    return this._needsPrep[tool];
  }

  needsInitialize(tool: string): boolean {
    if (this._needsInit[tool] === undefined) {
      throw new Error(`tool not supported: ${tool}`);
    }
    return this._needsInit[tool];
  }
}
