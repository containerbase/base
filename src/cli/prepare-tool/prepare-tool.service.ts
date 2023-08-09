import { inject, injectable, multiInject, optional } from 'inversify';
import { EnvService, PathService } from '../services';
import { NoPrepareTools } from '../tools';
import { logger } from '../utils';
import { PrepareLegacyToolsService } from './prepare-legacy-tools.service';
import type { PrepareToolBaseService } from './prepare-tool-base.service';

export const PREPARE_TOOL_TOKEN = Symbol('PREPARE_TOOL_TOKEN');

@injectable()
export class PrepareToolService {
  constructor(
    @inject(PrepareLegacyToolsService)
    private legacySvc: PrepareLegacyToolsService,
    @multiInject(PREPARE_TOOL_TOKEN)
    @optional()
    private toolSvcs: PrepareToolBaseService[] = [],
    @inject(PathService) private pathSvc: PathService,
    @inject(EnvService) private envSvc: EnvService,
  ) {}

  async execute(tools: string[], dryRun = false): Promise<number | void> {
    logger.debug(
      { tools: this.toolSvcs.map((t) => t.name) },
      'supported tools',
    );
    if (dryRun) {
      logger.info(`Dry run: preparing tools ${tools.join(', ')} ...`);
      return;
    }
    if (!this.envSvc.isRoot) {
      logger.fatal('prepare tools must be run as root');
      return 1;
    }
    if (tools.length === 1 && tools[0] === 'all') {
      for (const tool of this.toolSvcs) {
        if (this.envSvc.isToolIgnored(tool.name)) {
          logger.info({ tool }, 'tool ignored');
          continue;
        }
        if (await this.pathSvc.findToolPath(tool.name)) {
          logger.debug({ tool: tool.name }, 'tool already prepared');
          continue;
        }
        logger.debug({ tool: tool.name }, 'preparing tool');
        await tool.execute();
        await this.pathSvc.createToolPath(tool.name);
      }
      await this.legacySvc.execute(tools);
    } else {
      for (const tool of tools) {
        if (this.envSvc.isToolIgnored(tool)) {
          logger.info({ tool }, 'tool ignored');
          continue;
        }
        if (NoPrepareTools.includes(tool)) {
          logger.info({ tool }, 'tool does not need to be prepared');
          continue;
        }
        const toolSvc = this.toolSvcs.find((t) => t.name === tool);
        if (toolSvc) {
          if (await this.pathSvc.findToolPath(tool)) {
            logger.debug({ tool }, 'tool already prepared');
            continue;
          }
          logger.debug({ tool }, 'preparing tool');
          await toolSvc.execute();
          await this.pathSvc.createToolPath(tool);
        } else {
          await this.legacySvc.execute([tool]);
        }
      }
    }
  }
}
