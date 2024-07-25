import { deleteAsync } from 'del';
import { inject, injectable, multiInject, optional } from 'inversify';
import { prepareTools } from '../prepare-tool';
import { EnvService, PathService, VersionService } from '../services';
import { cleanAptFiles, cleanTmpFiles, isDockerBuild, logger } from '../utils';
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
    @inject(VersionService) private versionSvc: VersionService,
  ) {}

  async execute(
    tool: string,
    version: string,
    dryRun = false,
  ): Promise<number | void> {
    logger.debug(
      { tools: this.toolSvcs.map((t) => t.name) },
      'supported tools',
    );

    if (this.envSvc.isToolIgnored(tool)) {
      logger.info({ tool }, 'tool ignored');
      return 0;
    }

    try {
      const toolSvc = this.toolSvcs.find((t) => t.name === tool);
      if (toolSvc) {
        if (await toolSvc.isInstalled(version)) {
          logger.info({ tool }, 'tool already installed');
          await this.linkAndTest(toolSvc, version);
          return;
        }

        if (toolSvc.needsPrepare() && !(await toolSvc.isPrepared())) {
          logger.debug({ tool }, 'tool not prepared');
          const res = await prepareTools([tool], dryRun);
          if (res) {
            return res;
          }
        }

        logger.debug({ tool }, 'validate tool');
        if (!(await toolSvc.validate(version))) {
          logger.fatal({ tool, version }, 'tool version not supported');
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

      await this.versionSvc.update(tool, version);
    } catch (e) {
      await deleteAsync(version, { cwd: this.pathSvc.toolPath(tool) });
      throw e;
    } finally {
      if (this.envSvc.isRoot) {
        logger.debug('cleaning apt caches');
        await cleanAptFiles(dryRun);
      }

      if (await isDockerBuild()) {
        logger.debug('cleaning tmp files');
        await cleanTmpFiles(this.pathSvc.tmpDir, dryRun);

        if (this.envSvc.isRoot) {
          logger.debug('cleaning root caches');
          await deleteAsync(['/root/.cache', '/root/.local/share/virtualenv'], {
            force: true,
            dryRun,
            dot: true,
          });
        } else {
          logger.debug('cleaning user caches');
          await deleteAsync(
            [
              `${this.envSvc.userHome}/.cache`,
              `${this.envSvc.userHome}/.local/share/virtualenv`,
              `${this.pathSvc.cachePath}/**`,
            ],
            {
              force: true,
              dryRun,
              dot: true,
            },
          );
        }
      }
    }
  }

  private async linkAndTest(
    toolSvc: InstallToolBaseService,
    version: string,
  ): Promise<void> {
    if (version === (await this.versionSvc.find(toolSvc.name))) {
      logger.debug({ tool: toolSvc.name }, 'tool already linked');
    } else {
      logger.debug({ tool: toolSvc.name }, 'link tool');
      await toolSvc.link(version);
    }

    logger.debug({ tool: toolSvc.name }, 'post-install tool');
    await toolSvc.postInstall(version);

    logger.debug({ tool: toolSvc.name }, 'test tool');
    if (!this.envSvc.skipTests) {
      await toolSvc.test(version);
    }
  }
}
