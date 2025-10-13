import path from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { deleteAsync } from 'del';
import { inject, injectable, multiInject, optional } from 'inversify';
import spawn from 'nano-spawn';
import { initializeTools, prepareTools } from '../prepare-tool';
import {
  EnvService,
  IpcServer,
  LinkToolService,
  PathService,
  VersionService,
} from '../services';
import type { ToolState } from '../services/version.service';
import { cleanAptFiles, cleanTmpFiles, isDockerBuild, logger } from '../utils';
import { BlockingChild, MissingParent, NotSupported } from '../utils/codes';
import type { BaseInstallService } from './base-install.service';
import { V1ToolInstallService } from './install-legacy-tool.service';

export const INSTALL_TOOL_TOKEN = Symbol('INSTALL_TOOL_TOKEN');

@injectable()
export class InstallToolService {
  @inject(V1ToolInstallService)
  private readonly legacySvc!: V1ToolInstallService;
  @multiInject(INSTALL_TOOL_TOKEN)
  @optional()
  private readonly toolSvcs: BaseInstallService[] = [];
  @inject(EnvService)
  private readonly envSvc!: EnvService;

  @inject(IpcServer)
  private readonly ipc!: IpcServer;

  @inject(LinkToolService)
  private readonly _link!: LinkToolService;

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
      await this.ipc.start();
      this._link.clear();
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
            ...(parent && { parent: parent.tool }),
          })
        ) {
          logger.info({ tool }, 'tool already installed');
          await this.linkAndTest(toolSvc, version, parent);
          await this.versionSvc.update(tool, version);
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
            ...(parent && { parent: parent.tool }),
          });
          await this.linkAndTest(toolSvc, version, parent);
        }
      } else {
        if (dryRun) {
          logger.info(`Dry run: install tool ${tool} v${version} ...`);
          return;
        }
        if (!(await this.pathSvc.isLegacyTool(tool, true))) {
          logger.error({ tool }, 'tool not found');
          return 1;
        }
        await this.legacySvc.execute(tool, version);
        if (!(await this.versionSvc.isInstalled({ name: tool, version }))) {
          await this.versionSvc.addInstalled({ name: tool, version });
        }
        await this.versionSvc.setCurrent({
          name: tool,
          tool: { name: tool, version },
        });

        await this._storeLinks(tool, version);
      }
      await this.versionSvc.update(tool, version);
    } catch (e) {
      await deleteAsync(version, { cwd: this.pathSvc.toolPath(tool) });
      await this.versionSvc.removeInstalled({ name: tool, version });
      // TODO check and fix broken links
      throw e;
    } finally {
      this.ipc.stop();
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
              path.join(this.pathSvc.cachePath, '.cache/**'),
              path.join(this.pathSvc.cachePath, '.local/share/virtualenv'),
            ],
            {
              force: true,
              dryRun,
              dot: true,
            },
          );
        }
      }

      if (this.envSvc.cacheDir) {
        await spawn('bash', ['/usr/local/containerbase/bin/cleanup-cache.sh'], {
          stdio: ['inherit', 'inherit', 1],
        });
      }
    }
  }

  async uninstall(
    tool: string,
    version?: string,
    dryRun = false,
    recursive = false,
  ): Promise<number | void> {
    logger.trace(
      { tools: this.toolSvcs.map((t) => t.name) },
      'supported tools',
    );

    await this.pathSvc.ensureBasePaths();

    if (!isNonEmptyStringAndNotWhitespace(version)) {
      const versions = new Set<string>();
      for (const v of await this.versionSvc.findInstalled(tool)) {
        if (versions.has(v.version)) {
          continue;
        }
        versions.add(v.version);
        logger.info(`Uninstalling ${tool}@${v.version}...`);
        const res = await this.uninstall(tool, v.version, dryRun, recursive);
        if (res) {
          return res;
        }
      }
      return 0;
    }

    if (
      !(await this.versionSvc.isInstalled({
        name: tool,
        version,
      }))
    ) {
      logger.info({ tool }, 'tool not installed');
      return;
    }

    const toolSvc = this.toolSvcs.find((t) => t.name === tool);
    if (toolSvc) {
      logger.debug({ tool }, 'validate tool');
      const childs = await this.versionSvc.getChilds({ name: tool, version });
      if (childs.length) {
        if (recursive) {
          for (const child of childs) {
            logger.info(
              `Uninstalling child tool ${child.name}@${child.version}...`,
            );
            const res = await this.uninstall(
              child.name,
              child.version,
              dryRun,
              true,
            );
            if (res) {
              return res;
            }
          }
        } else {
          logger.fatal(
            {
              tool,
              version,
              childs: childs.map(({ name, version }) => ({ name, version })),
            },
            'tool version has child dependencies and cannot be uninstalled',
          );
          return BlockingChild;
        }
      }

      if (dryRun) {
        logger.info(`Dry run: uninstall tool ${tool} ...`);
        return;
      } else {
        logger.debug({ tool }, 'uninstall tool');
        await toolSvc.uninstall(version);
        const vTool = { name: tool, version };
        await this.versionSvc.removeInstalled(vTool);
        if (
          await this.versionSvc.isCurrent({
            name: tool,
            tool: vTool,
          })
        ) {
          await this.versionSvc.removeCurrent(tool);
        }

        for (const { name } of await this.versionSvc.findLinks(vTool)) {
          await this._link.rm(name);
        }

        await this.versionSvc.removeLinks(vTool);
      }
    } else {
      logger.fatal({ tool, version }, 'legacy tools cannot be uninstalled');
      return NotSupported;
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

    logger.debug({ tool: toolSvc.name }, 'post-install tool');
    await toolSvc.postInstall(version);

    await this._storeLinks(toolSvc.name, version);

    logger.debug({ tool: toolSvc.name }, 'test tool');
    if (!this.envSvc.skipTests) {
      await toolSvc.test(version);
    }
  }

  private async _storeLinks(tool: string, version: string): Promise<void> {
    const links = this._link.links;
    logger.debug({ tool, version, links }, 'linked tools');

    for (const name of links) {
      await this.versionSvc.setLink({
        name,
        tool: { name: tool, version },
      });
    }
  }
}
