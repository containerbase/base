import { deleteAsync } from 'del';
import { inject, injectable, multiInject, optional } from 'inversify';
import { EnvService, PathService } from '../services/index.ts';
import { NoPrepareTools } from '../tools/index.ts';
import { cleanAptFiles, cleanTmpFiles, logger } from '../utils/index.ts';
import type { BasePrepareService } from './base-prepare.service';

export const PREPARE_TOOL_TOKEN = Symbol('PREPARE_TOOL_TOKEN');

@injectable()
export class PrepareToolService {
  @multiInject(PREPARE_TOOL_TOKEN)
  @optional()
  private readonly toolSvcs!: BasePrepareService[];
  @inject(PathService)
  private readonly pathSvc!: PathService;
  @inject(EnvService)
  private readonly envSvc!: EnvService;

  /**
   * Prepares the given tools, or every tool for `all`, and marks them as
   * prepared. Must run as root.
   *
   * @returns an exit code when the tools could not be prepared
   */
  async prepare(tools: string[], dryRun = false): Promise<number | void> {
    const supportedTools = this.toolSvcs.map((t) => t.name).sort();
    logger.trace(
      { tools: supportedTools },
      'PrepareToolService.prepare: supported tools',
    );
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
        for (const tool of this.toolSvcs) {
          const res = await this._prepareTool(tool, dryRun);
          /* v8 ignore if -- `_prepareTool` does not report failures yet */
          if (res) {
            return res;
          }
          await this.pathSvc.setPrepared(tool.name);
        }
      } else {
        for (const tool of tools) {
          if (NoPrepareTools.includes(tool)) {
            logger.debug(
              { tool },
              'tool does not need to be prepared (no service)',
            );
            continue;
          }
          const svc = this.toolSvcs.find((s) => s.name === tool);
          if (!svc) {
            logger.error({ tool }, 'tool not found');
            return 1;
          }
          const res = await this._prepareTool(svc, dryRun);
          /* v8 ignore if -- `_prepareTool` does not report failures yet */
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

  /**
   * Initializes the given tools, or for `all` every tool which was prepared in
   * this image, and marks them as initialized.
   *
   * @returns an exit code when the tools could not be initialized
   */
  async initialize(tools: string[], dryRun = false): Promise<number | void> {
    const supportedTools = this.toolSvcs.map((t) => t.name).sort();
    logger.trace(
      { tools: supportedTools },
      'PrepareToolService.initialize: supported tools',
    );
    if (dryRun) {
      logger.info(`Dry run: initializing tools ${tools.join(', ')} ...`);
      return;
    }

    await this.pathSvc.ensureBasePaths();

    if (tools.length === 1 && tools[0] === 'all') {
      const set = new Set(await this.pathSvc.findPreparedTools());
      for (const tool of this.toolSvcs.filter((t) => set.has(t.name))) {
        const res = await this._initTool(tool, dryRun);
        /* v8 ignore if -- `_initTool` does not report failures yet */
        if (res) {
          return res;
        }
        await this.pathSvc.setInitialized(tool.name);
      }
    } else {
      const set = new Set(supportedTools);
      for (const tool of tools
        .filter((t) => set.has(t))
        .map((t) => this.toolSvcs.find((s) => s.name === t)!)) {
        const res = await this._initTool(tool, dryRun);
        /* v8 ignore if -- `_initTool` does not report failures yet */
        if (res) {
          return res;
        }
        await this.pathSvc.setInitialized(tool.name);
      }
    }
  }

  /** Initializes a tool, unless it is ignored, needs no init or already had it. */
  private async _initTool(
    tool: BasePrepareService,
    _dryRun: boolean,
  ): Promise<number | void> {
    if (this.envSvc.isToolIgnored(tool.name)) {
      logger.info({ tool: tool.name }, 'tool ignored');
      return;
    }
    if (!tool.needsInitialize()) {
      logger.debug({ tool: tool.name }, 'tool does not need to be initialized');
      return;
    }
    if (await this.pathSvc.isInitialized(tool.name)) {
      logger.debug({ tool: tool.name }, 'tool already initialized');
      return;
    }

    logger.debug({ tool: tool.name }, 'initialize tool');
    await this.pathSvc.ensureToolPath(tool.name);
    await tool.initialize();
  }

  /** Prepares a tool, unless it is ignored, needs no prepare or already had it. */
  private async _prepareTool(
    tool: BasePrepareService,
    _dryRun: boolean,
  ): Promise<number | void> {
    if (this.envSvc.isToolIgnored(tool.name)) {
      logger.info({ tool: tool.name }, 'tool ignored');
      return;
    }
    if (!tool.needsPrepare()) {
      logger.debug({ tool: tool.name }, 'tool does not need to be prepared');
      return;
    }
    if (await this.pathSvc.isPrepared(tool.name)) {
      logger.debug({ tool: tool.name }, 'tool already prepared');
      return;
    }

    logger.debug({ tool: tool.name }, 'preparing tool');
    await this.pathSvc.ensureToolPath(tool.name);
    await tool.prepare();
  }
}
