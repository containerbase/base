import { deleteAsync } from 'del';
import { inject, injectable, multiInject, optional } from 'inversify';
import { initializeTools, prepareTools } from '../prepare-tool';
import { EnvService, PathService, VersionService } from '../services';
import type { ToolState } from '../services/version.service';
import { cleanAptFiles, cleanTmpFiles, isDockerBuild, logger } from '../utils';
import { MissingParent } from '../utils/codes';
import type { BaseInstallService } from './base-install.service';
import { LegacyToolInstallService } from './install-legacy-tool.service';

export const INSTALL_TOOL_TOKEN = Symbol('INSTALL_TOOL_TOKEN');

@injectable()
export class InstallToolService {
  @inject(LegacyToolInstallService)
  private readonly legacySvc!: LegacyToolInstallService;
  @multiInject(INSTALL_TOOL_TOKEN)
  @optional()
  private readonly toolSvcs: BaseInstallService[] = [];
  @inject(EnvService)
  private readonly envSvc!: EnvService;
  @inject(PathService)
  private readonly pathSvc!: PathService;
  @inject(VersionService)
  private readonly versionSvc!: VersionService;

  async install(
    tool: string,
    version: string,
    dryRun = false,
  ): Promise<number | void> {
    logger.trace(
      { tools: this.toolSvcs.map((t) => t.name) },
      'supported tools',
    );

    await this.pathSvc.ensureBasePaths();

    try {
      const toolSvc = this.toolSvcs.find((t) => t.name === tool);
      if (toolSvc) {
        let parent: ToolState | null = null;

        if (toolSvc.parent) {
          parent = await this.versionSvc.getCurrent(toolSvc.parent);
          if (!parent) {
            logger.fatal(
              { tool: toolSvc.name, parent: toolSvc.parent },
              'parent tool not installed',
            );
            return MissingParent;
          }
        }
        if (
          await this.versionSvc.isInstalled({
            name: tool,
            version,
            ...(parent && { tool: parent.tool }),
          })
        ) {
          logger.info({ tool }, 'tool already installed');
          await this.linkAndTest(toolSvc, version, parent);
          return;
        }

        if (toolSvc.needsPrepare() && !(await toolSvc.isPrepared())) {
          logger.debug({ tool }, 'tool not prepared');
          const res = await prepareTools([tool], dryRun);
          if (res) {
            return res;
          }
        }

        if (toolSvc.needsInitialize() && !(await toolSvc.isInitialized())) {
          logger.debug({ tool }, 'tool not initialized');
          const res = await initializeTools([tool], dryRun);
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
          await this.versionSvc.addInstalled({
            name: tool,
            version,
            ...(parent && { tool: parent.tool }),
          });
          await this.linkAndTest(toolSvc, version, parent);
        }
      } else {
        if (dryRun) {
          logger.info(`Dry run: install tool ${tool} v${version} ...`);
          return;
        }
        await this.legacySvc.execute(tool, version);
        await this.versionSvc.addInstalled({ name: tool, version });
        await this.versionSvc.setCurrent({
          name: tool,
          tool: { name: tool, version },
        });
      }
    } catch (e) {
      await deleteAsync(version, { cwd: this.pathSvc.toolPath(tool) });
      await this.versionSvc.removeInstalled({ name: tool, version });
      // TODO check and fix broken links
      throw e;
    } finally {
      if (this.envSvc.isRoot) {
        logger.debug('cleaning apt caches');
        await cleanAptFiles(dryRun);
      }

      if (await isDockerBuild()) {
        logger.debug('cleaning tmp files');
        await cleanTmpFiles(this.envSvc.tmpDir, dryRun);

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
              `${this.pathSvc.cachePath}/.cache/**`,
              `${this.pathSvc.cachePath}/.local/share/virtualenv`,
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
    toolSvc: BaseInstallService,
    version: string,
    parent: ToolState | null,
  ): Promise<void> {
    const current: ToolState = {
      name: toolSvc.alias,
      tool: { name: toolSvc.name, version },
      ...(parent && { parent: parent.tool }),
    };
    if (await this.versionSvc.isCurrent(current)) {
      logger.debug({ tool: toolSvc.name }, 'tool already linked');
    } else {
      logger.debug({ tool: toolSvc.name }, 'link tool');
      await toolSvc.link(version);
      await this.versionSvc.setCurrent(current);
    }

    // logger.debug({ tool: toolSvc.name }, 'post-install tool');
    // await toolSvc.postInstall(version);

    logger.debug({ tool: toolSvc.name }, 'test tool');
    if (!this.envSvc.skipTests) {
      await toolSvc.test(version);
    }
  }
}
