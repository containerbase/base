import { inject, injectable } from 'inversify';
import spawn from 'nano-spawn';
import { V2ToolService } from '../services';
import { logger } from '../utils';
import { BasePrepareService } from './base-prepare.service';

@injectable()
export abstract class V2ToolPrepareService extends BasePrepareService {
  @inject(V2ToolService)
  private readonly _svc!: V2ToolService;

  override needsInitialize(): boolean {
    return this._svc.needsInitialize(this.name);
  }

  override needsPrepare(): boolean {
    return this._svc.needsPrepare(this.name);
  }

  override async initialize(): Promise<void> {
    logger.debug(`Initializing v2 tool ${this.name} ...`);
    await spawn(
      'bash',
      ['/usr/local/containerbase/bin/v2-install-tool.sh', 'init', this.name],
      {
        stdio: ['inherit', 'inherit', 1],
      },
    );
  }

  override async prepare(): Promise<void> {
    logger.debug(`Preparing v2 tool ${this.name} ...`);
    await spawn(
      'bash',
      ['/usr/local/containerbase/bin/v2-install-tool.sh', 'prepare', this.name],
      {
        stdio: ['inherit', 'inherit', 1],
      },
    );
  }
}
