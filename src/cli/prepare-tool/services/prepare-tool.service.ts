import { execa } from 'execa';
import { injectable } from 'inversify';
import { logger } from '../../utils';

@injectable()
export class PrepareToolService {
  async prepareTool(tools: string[]): Promise<void> {
    logger.info(`Preparing legacy tools ${tools.join(', ')} ...`);
    await execa('/usr/local/containerbase/bin/prepare-tool', tools, {
      stdio: 'inherit',
    });
  }
}
