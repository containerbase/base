import { execa } from 'execa';
import { injectable } from 'inversify';
import { logger } from '../utils';

@injectable()
export class InstallLegacyToolService {
  async execute(tool: string, version: string): Promise<void> {
    logger.debug(`Installing legacy tool ${tool} v${version} ...`);
    await execa('/usr/local/containerbase/bin/install-tool', [tool, version], {
      stdio: 'inherit',
    });
  }
}
