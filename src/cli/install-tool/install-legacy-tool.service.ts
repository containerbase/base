import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { EnvService } from '../services';
import { logger } from '../utils';

const defaultPipRegistry = 'https://pypi.org/simple/';

@injectable()
export class InstallLegacyToolService {
  constructor(@inject(EnvService) private readonly envSvc: EnvService) {}

  async execute(tool: string, version: string): Promise<void> {
    logger.debug(`Installing legacy tool ${tool} v${version} ...`);
    const env: NodeJS.ProcessEnv = {};

    const pipIndex = this.envSvc.replaceUrl(defaultPipRegistry);
    if (pipIndex !== defaultPipRegistry) {
      env.PIP_INDEX_URL = pipIndex;
    }

    await execa('/usr/local/containerbase/bin/install-tool', [tool, version], {
      stdio: ['inherit', 'inherit', 1],
      env,
    });
  }
}
