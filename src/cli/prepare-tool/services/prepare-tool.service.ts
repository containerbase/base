import { Injectable } from '@nestjs/common';
import { execa } from 'execa';
import { logger } from '../../utils';

@Injectable()
export class PrepareToolService {
  async prepareTool(tools: string[]): Promise<void> {
    logger.info(`Preparing legacy tools ${tools.join(', ')} ...`);
    await execa('/usr/local/containerbase/bin/prepare-tool', tools, {
      stdio: 'inherit',
    });
  }
}
