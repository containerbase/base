import { inject, injectable, multiInject, optional } from 'inversify';
import { logger } from '../utils';
import { PREPARE_TOOL_TOKEN } from './common';
import { PrepareLegacyToolsService } from './prepare-legacy-tools.service';
import type { PrepareToolBaseService } from './prepare-tool-base.service';

@injectable()
export class PrepareToolService {
  constructor(
    @inject(PrepareLegacyToolsService)
    private legacySvc: PrepareLegacyToolsService,
    @multiInject(PREPARE_TOOL_TOKEN)
    @optional()
    private toolSvcs: PrepareToolBaseService[] = []
  ) {}

  async execute(tools: string[], dryRun = false): Promise<number | void> {
    logger.debug(
      { tools: this.toolSvcs.map((t) => t.name) },
      'supported tools'
    );
    if (dryRun) {
      logger.info(`Dry run: preparing tools ${tools.join(', ')} ...`);
      return;
    }
    if (tools.length === 1 && tools[0] === 'all') {
      for (const tool of this.toolSvcs) {
        logger.debug({ tool: tool.name }, 'preparing tool');
        await tool.execute();
      }
      await this.legacySvc.prepareTool(tools);
    } else {
      for (const tool of tools) {
        const toolSvc = this.toolSvcs.find((t) => t.name === tool);
        if (toolSvc) {
          logger.debug({ tool }, 'preparing tool');
          await toolSvc.execute();
        } else {
          await this.legacySvc.prepareTool([tool]);
        }
      }
    }
  }
}
