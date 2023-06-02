import { Command, Option } from 'clipanion';
import { PREPARE_TOOL_TOKEN, container } from '../prepare-tool';
import type { BaseService } from '../prepare-tool/services/base.service';
import { PrepareToolService } from '../prepare-tool/services/prepare-tool.service';
import { logger } from '../utils';

export class PrepareToolCommand extends Command {
  static paths = [['prepare', 'tool'], ['pt']];

  static usage = Command.Usage({
    description: 'Prepares a tool into the container.',
    examples: [
      ['Prepares node', '$0 prepare tool node'],
      ['Prepares all tools', '$0 prepare tool all'],
    ],
  });

  tools = Option.Rest({ required: 1 });

  dryRun = Option.Boolean('-d,--dry-run', false);

  async execute(): Promise<number | void> {
    const legacySvc = container.get(PrepareToolService);
    const tools = container.getAll<BaseService>(PREPARE_TOOL_TOKEN);

    logger.debug({ tools: tools.map((t) => t.name) }, 'supported tools');
    if (this.dryRun) {
      logger.info(
        `Dry run: preparing legacy tools ${this.tools.join(', ')} ...`
      );
      return;
    }
    try {
      if (this.tools.length === 1 && this.tools[0] === 'all') {
        for (const tool of tools) {
          await tool.run();
        }
        await legacySvc.prepareTool(this.tools);
      } else {
        for (const tool of this.tools) {
          const toolSvc = tools.find((t) => t.name === tool);
          if (toolSvc) {
            await toolSvc.run();
          } else {
            await legacySvc.prepareTool([tool]);
          }
        }
      }
    } catch (err) {
      logger.fatal(err);
      return 1;
    }
  }
}

export class PrepareToolShortCommand extends PrepareToolCommand {
  static paths = [];

  static usage = Command.Usage({
    description: 'Prepares a tool into the container.',
    examples: [
      ['Prepares node', '$0 node'],
      ['Prepares all tools', '$0'],
    ],
  });
}
