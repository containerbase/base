import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { V2ToolService } from '../services/index.ts';
import { logger } from '../utils/index.ts';
import { BasePrepareService } from './base-prepare.service.ts';

@injectable()
export abstract class V2ToolPrepareService extends BasePrepareService {
  @inject(V2ToolService)
  private readonly _svc!: V2ToolService;

  /** Whether the v2 shell tool defines an `init_tool` function. */
  override needsInitialize(): boolean {
    return this._svc.needsInitialize(this.name);
  }

  /** Whether the v2 shell tool defines a `prepare_tool` function. */
  override needsPrepare(): boolean {
    return this._svc.needsPrepare(this.name);
  }

  /** Runs the `init` step of the v2 shell tool. */
  override async initialize(): Promise<void> {
    logger.debug(`Initializing v2 tool ${this.name} ...`);
    await execa(
      'bash',
      ['/usr/local/containerbase/bin/v2-install-tool.sh', 'init', this.name],
      {
        stdio: ['inherit', 'inherit', 1],
      },
    );
  }

  /** Runs the `prepare` step of the v2 shell tool. */
  override async prepare(): Promise<void> {
    logger.debug(`Preparing v2 tool ${this.name} ...`);
    await execa(
      'bash',
      ['/usr/local/containerbase/bin/v2-install-tool.sh', 'prepare', this.name],
      {
        stdio: ['inherit', 'inherit', 1],
      },
    );
  }
}
