import path from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { deleteAsync } from 'del';
import { inject, injectable, multiInject, optional } from 'inversify';
import { initializeTools, prepareTools } from '../prepare-tool/index.ts';
import {
  CacheService,
  EnvService,
  IpcServer,
  LinkToolService,
  PathService,
  VersionService,
} from '../services/index.ts';
import type { ToolState } from '../services/version.service';
import {
  BlockingChild,
  MissingParent,
  NotRoot,
  NotSupported,
} from '../utils/codes.ts';
import {
  cleanAptFiles,
  cleanTmpFiles,
  isDockerBuild,
  logger,
} from '../utils/index.ts';
import type { BaseInstallService } from './base-install.service';
import {
  V1ToolInstallService,
  V2ToolInstallService,
} from './install-legacy-tool.service.ts';

export const INSTALL_TOOL_TOKEN = Symbol('INSTALL_TOOL_TOKEN');

@injectable()
export class InstallToolService {
  @inject(V1ToolInstallService)
  private readonly legacySvc!: V1ToolInstallService;
  @multiInject(INSTALL_TOOL_TOKEN)
  @optional()
  private readonly toolSvcs: BaseInstallService[] = [];
  @inject(CacheService)
  private readonly cacheSvc!: CacheService;
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

  /**
   * Runs the install lifecycle of a tool: prepare, initialize, validate,
   * install, link and test. Afterwards the oldest files are evicted from the
   * download cache when the disk is too full, see `CacheService.evict`. A
   * failing eviction is only logged.
   *
   * @returns an exit code when the tool could not be installed
   */
  async install(
    tool: string,
    version: string,
    dryRun = false,
  ): Promise<number | void> {
    logger.trace(
      { tools: this.toolSvcs.map((t) => t.name) },
      'InstallToolService.install: supported tools',
    );

    await this.pathSvc.ensureBasePaths();

    const toolSvc = this.toolSvcs.find((t) => t.name === tool);
    let parent: ToolState | null = null;
    try {
      await this.ipc.start();
      this._link.clear();
      if (toolSvc) {
        if (toolSvc.needsRoot && !this.envSvc.isRoot) {
          logger.fatal({ tool }, 'tool must be installed as root');
          return NotRoot;
        }

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
        let missing = false;
        if (
          await this.versionSvc.isInstalled({
            name: tool,
            version,
            ...(parent && { parent: parent.tool }),
          })
        ) {
          if (!(await this.isMissing(toolSvc, version))) {
            logger.info({ tool }, 'tool already installed');
            await this.linkAndTest(toolSvc, version, parent);
            await this.versionSvc.update(tool, version);
            return;
          }
          logger.info({ tool, version }, 'tool version missing, installing');
          missing = true;
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
          if (!missing) {
            await this.versionSvc.addInstalled({
              name: tool,
              version,
              ...(parent && { parent: parent.tool }),
            });
          }
          await this.linkAndTest(toolSvc, version, parent, missing);
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
      await this.removeFailedInstall(tool, version, toolSvc, parent);
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
          await deleteAsync(
            [
              '/root/.{android,android-sdk,cache}',
              '/root/.local/share/virtualenv',
            ],
            {
              force: true,
              dryRun,
              dot: true,
            },
          );
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

      try {
        await this.cacheSvc.evict(dryRun);
      } catch (err) {
        // best effort, it must not change the result of the install
        logger.warn({ err }, 'cannot evict the download cache');
      }
    }
  }

  /**
   * Removes what a failed install left. A tool installed per parent version,
   * eg. a npm package, only loses the folder and the record of the parent
   * version it was installed for, the copies for other parent versions keep
   * working. For other tools and the legacy tools the version is removed with
   * all its records.
   */
  private async removeFailedInstall(
    tool: string,
    version: string,
    toolSvc: BaseInstallService | undefined,
    parent: ToolState | null,
  ): Promise<void> {
    if (toolSvc?.parentScoped && parent) {
      await deleteAsync(path.join(version, parent.tool.version), {
        cwd: this.pathSvc.toolPath(tool),
      });
      await this.versionSvc.removeInstalled({
        name: tool,
        version,
        parent: parent.tool,
      });
      return;
    }
    await deleteAsync(version, { cwd: this.pathSvc.toolPath(tool) });
    await this.versionSvc.removeInstalled({ name: tool, version });
  }

  /**
   * Removes a tool version, or every installed version when none is given.
   * A dry run only logs and skips `ensureBasePaths`, so it sets up no tmp
   * link or base folders.
   *
   * @returns an exit code when the tool could not be uninstalled, eg. because
   * another tool depends on the version
   */
  async uninstall(
    tool: string,
    version?: string,
    dryRun = false,
    recursive = false,
  ): Promise<number | void> {
    logger.trace(
      { tools: this.toolSvcs.map((t) => t.name) },
      'InstallToolService.uninstall: supported tools',
    );

    if (!dryRun) {
      // a dry run sets up no tmp link or base folders
      await this.pathSvc.ensureBasePaths();
    }

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
      if (!toolSvc.canUninstall) {
        logger.fatal({ tool }, 'tool cannot be uninstalled');
        return NotSupported;
      }

      if (toolSvc.needsRoot && !this.envSvc.isRoot) {
        logger.fatal({ tool }, 'tool must be uninstalled as root');
        return NotRoot;
      }

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

  /**
   * Whether a version recorded as installed is gone from the disk, eg. its
   * folder was removed. Tools which can't be uninstalled, like git which apt
   * installs, and the v2 shell tools are never missing, as their files don't
   * have to be in the versioned tool path.
   */
  private async isMissing(
    toolSvc: BaseInstallService,
    version: string,
  ): Promise<boolean> {
    return (
      toolSvc.canUninstall &&
      !(toolSvc instanceof V2ToolInstallService) &&
      !(await toolSvc.isInstalled(version))
    );
  }

  /**
   * Links the version onto the path and records it as the current one, unless
   * it already is, except with `force`. Then runs the post-install step,
   * records the created shell wrappers and runs the tool test, unless tests
   * are skipped. The link context tells the linking which version it links.
   *
   * @param force - link also the current version, eg. after its files were
   * installed again
   */
  private async linkAndTest(
    toolSvc: BaseInstallService,
    version: string,
    parent: ToolState | null,
    force = false,
  ): Promise<void> {
    this._link.setContext({
      tool: toolSvc.name,
      version,
      dir: toolSvc.versionDir(version, parent?.tool.version),
    });
    try {
      const current: ToolState = {
        name: toolSvc.alias,
        tool: { name: toolSvc.name, version },
        ...(parent && { parent: parent.tool }),
      };
      if (!force && (await this.versionSvc.isCurrent(current))) {
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
    } finally {
      this._link.resetContext();
    }
  }

  /**
   * Records which shell wrappers the last link step created, so they can be
   * removed again when the version is uninstalled.
   */
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
