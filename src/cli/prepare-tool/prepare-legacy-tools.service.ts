import { execa } from 'execa';
import { injectable } from 'inversify';
import { logger } from '../utils';

@injectable()
export class PrepareLegacyToolsService {
  async prepare(tool: string): Promise<void> {
    logger.debug(`Preparing legacy tool ${tool} ...`);
    await execa('/usr/local/containerbase/bin/prepare-tool.sh', [tool], {
      stdio: ['inherit', 'inherit', 1],
    });
  }

  async initialize(tool: string): Promise<void> {
    logger.debug(`Initializing legacy tool ${tool} ...`);
    await execa('/usr/local/containerbase/bin/init-tool.sh', [tool], {
      stdio: ['inherit', 'inherit', 1],
    });
  }
}
