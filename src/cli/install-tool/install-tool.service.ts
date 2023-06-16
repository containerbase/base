import { inject, injectable, multiInject, optional } from 'inversify';
import { prepareTools } from '../prepare-tool';
import { EnvService, PathService, VersionService } from '../services';
import { logger } from '../utils';
import { InstallLegacyToolService } from './install-legacy-tool.service';
import type { InstallToolBaseService } from './install-tool-base.service';

export const INSTALL_TOOL_TOKEN = Symbol('INSTALL_TOOL_TOKEN');

@injectable()
export class InstallToolService {
  constructor(
    @inject(InstallLegacyToolService)
    private legacySvc: InstallLegacyToolService,
    @multiInject(INSTALL_TOOL_TOKEN)
    @optional()
    private toolSvcs: InstallToolBaseService[] = [],
    @inject(EnvService) private envSvc: EnvService,
    @inject(PathService) private pathSvc: PathService,
    @inject(VersionService) private versionSvc: VersionService
  ) {}

  async execute(
    tool: string,
    version: string,
    dryRun = false
  ): Promise<number | void> {
    logger.debug(
      { tools: this.toolSvcs.map((t) => t.name) },
      'supported tools'
    );

    const toolSvc = this.toolSvcs.find((t) => t.name === tool);
    if (toolSvc) {
      if (await toolSvc.isInstalled(version)) {
        logger.info({ tool }, 'tool already installed');
        await this.linkAndTest(toolSvc, version);
        return;
      }

      if (!(await this.pathSvc.findToolPath(tool))) {
        logger.debug({ tool }, 'tool not prepared');
        const res = await prepareTools([tool], dryRun);
        if (res) {
          return res;
        }
      }

      logger.debug({ tool }, 'validate tool');
      if (!toolSvc.validate(version)) {
        logger.fatal({ tool }, 'tool version not supported');
        return 1;
      }

      if (dryRun) {
        logger.info(`Dry run: install tool ${tool} ...`);
        return;
      } else {
        logger.debug({ tool }, 'install tool');
        await toolSvc.install(version);
        // TODO delete versioned tool path on error
        await this.linkAndTest(toolSvc, version);
      }
    } else {
      if (dryRun) {
        logger.info(`Dry run: install tool ${tool} v${version} ...`);
        return;
      }
      await this.legacySvc.execute(tool, version);
    }
  }
  private async linkAndTest(
    toolSvc: InstallToolBaseService,
    version: string
  ): Promise<void> {
    if (version === (await this.versionSvc.find(toolSvc.name))) {
      logger.debug({ tool: toolSvc.name }, 'tool already linked');
      return;
    }
    logger.debug({ tool: toolSvc.name }, 'link tool');
    await toolSvc.link(version);
    await this.versionSvc.update(toolSvc.name, version);
    logger.debug({ tool: toolSvc.name }, 'test tool');
    if (!this.envSvc.skipTests) {
      await toolSvc.test(version);
    }
  }
}
