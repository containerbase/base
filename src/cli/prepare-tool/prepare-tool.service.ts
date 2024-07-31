import { deleteAsync } from 'del';
import { inject, injectable, multiInject, optional } from 'inversify';
import { EnvService, PathService } from '../services';
import { NoInitTools, NoPrepareTools } from '../tools';
import { cleanAptFiles, cleanTmpFiles, logger } from '../utils';
import type { BasePrepareService } from './base-prepare.service';
import { PrepareLegacyToolsService } from './prepare-legacy-tools.service';

export const PREPARE_TOOL_TOKEN = Symbol('PREPARE_TOOL_TOKEN');

@injectable()
export class PrepareToolService {
  constructor(
    @inject(PrepareLegacyToolsService)
    private legacySvc: PrepareLegacyToolsService,
    @multiInject(PREPARE_TOOL_TOKEN)
    @optional()
    private toolSvcs: BasePrepareService[] = [],
    @inject(PathService) private pathSvc: PathService,
    @inject(EnvService) private envSvc: EnvService,
  ) {}

  async prepare(tools: string[], dryRun = false): Promise<number | void> {
    const supportedTools = [
      ...this.toolSvcs.map((t) => t.name),
      ...(await this.pathSvc.findLegacyTools()),
    ].sort();
    logger.trace({ tools: supportedTools }, 'supported tools');
    if (dryRun) {
      logger.info(`Dry run: preparing tools ${tools.join(', ')} ...`);
      return;
    }
    if (!this.envSvc.isRoot) {
      logger.fatal('prepare tools must be run as root');
      return 1;
    }
    try {
      if (tools.length === 1 && tools[0] === 'all') {
        for (const tool of supportedTools) {
          const res = await this._prepareTool(tool, dryRun);
          if (res) {
            return res;
          }
          await this.pathSvc.setPrepared(tool);
        }
      } else {
        for (const tool of tools) {
          const res = await this._prepareTool(tool, dryRun);
          if (res) {
            return res;
          }
          await this.pathSvc.setPrepared(tool);
        }
      }
    } finally {
      await cleanAptFiles(dryRun);
      await cleanTmpFiles(this.envSvc.tmpDir, dryRun);
      await deleteAsync(['/root/.cache', '/root/.local/share/virtualenv'], {
        force: true,
        dryRun,
        dot: true,
      });
    }
  }

  async initialize(tools: string[], dryRun = false): Promise<number | void> {
    const supportedTools = [
      ...this.toolSvcs.map((t) => t.name),
      ...(await this.pathSvc.findLegacyTools()),
    ].sort();
    logger.trace({ tools: supportedTools }, 'supported tools');
    if (dryRun) {
      logger.info(`Dry run: initializing tools ${tools.join(', ')} ...`);
      return;
    }

    await this.pathSvc.ensureBasePaths();

    if (tools.length === 1 && tools[0] === 'all') {
      for (const tool of supportedTools) {
        const res = await this._initTool(tool, dryRun);
        if (res) {
          return res;
        }
        await this.pathSvc.setInitialized(tool);
      }
    } else {
      for (const tool of tools) {
        const res = await this._initTool(tool, dryRun);
        if (res) {
          return res;
        }
        await this.pathSvc.setInitialized(tool);
      }
    }
  }

  private async _initTool(
    tool: string,
    _dryRun: boolean,
  ): Promise<number | void> {
    if (this.envSvc.isToolIgnored(tool)) {
      logger.info({ tool }, 'tool ignored');
      return;
    }
    if (NoInitTools.includes(tool)) {
      logger.info({ tool }, 'tool does not need to be initialized');
      return;
    }
    if (await this.pathSvc.isInitialized(tool)) {
      logger.debug({ tool }, 'tool already initialized');
      return;
    }
    const toolSvc = this.toolSvcs.find((t) => t.name === tool);
    if (toolSvc) {
      logger.debug({ tool }, 'initialize tool');
      await toolSvc.initialize();
      await this.pathSvc.ensureToolPath(tool);
    } else if (await this.pathSvc.isLegacyTool(tool)) {
      await this.legacySvc.initialize(tool);
    } // ignore else
  }

  private async _prepareTool(
    tool: string,
    _dryRun: boolean,
  ): Promise<number | void> {
    if (this.envSvc.isToolIgnored(tool)) {
      logger.info({ tool }, 'tool ignored');
      return;
    }
    if (NoPrepareTools.includes(tool)) {
      logger.info({ tool }, 'tool does not need to be prepared');
      return;
    }
    if (await this.pathSvc.isPrepared(tool)) {
      logger.debug({ tool }, 'tool already prepared');
      return;
    }
    const toolSvc = this.toolSvcs.find((t) => t.name === tool);
    if (toolSvc) {
      logger.debug({ tool }, 'preparing tool');
      await toolSvc.prepare();
      await this.pathSvc.ensureToolPath(tool);
    } else if (await this.pathSvc.isLegacyTool(tool)) {
      await this.legacySvc.prepare(tool);
    } else {
      logger.error({ tool }, 'tool not found');
      return 1;
    }
  }
}
