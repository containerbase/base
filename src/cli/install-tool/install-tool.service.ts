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
  SnapshotService,
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
import { V1ToolInstallService } from './install-legacy-tool.service.ts';

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
  @inject(SnapshotService)
  private readonly snapshotSvc!: SnapshotService;
  @inject(VersionService)
  private readonly versionSvc!: VersionService;

  /**
   * Runs the install lifecycle of a tool: prepare, initialize, validate,
   * install, link and test. At image build time, the install updates the
   * snapshot, see `SnapshotService`: on success the version folder is moved
   * there and linked back, then on every exit except a dry run the files
   * outside of the version folders are updated. A failed install also
   * removes the snapshot copy of the version, snapshot errors after a failed
   * install are only logged. The caches are cleaned in any case, and the
   * oldest files are evicted from the download cache when the disk is too
   * full, see `CacheService.evict`. A failing eviction is only logged.
   *
   * @returns an exit code when the tool could not be installed
   * @throws when the install fails, or the snapshot of a successful one
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

    let failed = false;
    // whether to move the version folder into the snapshot, `moveAndLink`
    // skips a folder which is already linked
    let moveFolder = false;
    const toolSvc = this.toolSvcs.find((t) => t.name === tool);
    try {
      await this.ipc.start();
      this._link.clear();
      if (toolSvc) {
        if (toolSvc.needsRoot && !this.envSvc.isRoot) {
          logger.fatal({ tool }, 'tool must be installed as root');
          return NotRoot;
        }

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
          // a version folder which is still real, eg. installed before the
          // snapshot existed, is moved too
          moveFolder = true;
          return;
        }

        if (toolSvc.needsPrepare() && !(await toolSvc.isPrepared())) {
          logger.debug({ tool }, 'tool not prepared');
          // the install updates the snapshot afterwards, also when it fails
          const res = await prepareTools([tool], dryRun, false);
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
          moveFolder = true;
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

        // v1 shell tools don't install below the tools folder, so only the
        // files outside of the version folders are snapshotted
        await this._storeLinks(tool, version);
      }
      await this.versionSvc.update(tool, version);
    } catch (e) {
      failed = true;
      await deleteAsync(version, { cwd: this.pathSvc.toolPath(tool) });
      if (toolSvc && (await isDockerBuild())) {
        try {
          logger.debug({ tool, version }, 'remove snapshot');
          await toolSvc.removeSnapshot(version);
        } catch (err) {
          logger.warn({ err, tool, version }, 'could not remove the snapshot');
        }
      }
      await this.versionSvc.removeInstalled({ name: tool, version });
      // TODO check and fix broken links
      throw e;
    } finally {
      this.ipc.stop();
      await this.finish(
        tool,
        version,
        dryRun,
        failed,
        moveFolder ? toolSvc : undefined,
      );
    }
  }

  /**
   * Ends an install: at image build time, except for a dry run, updates the
   * snapshot, see `snapshot`, then cleans the caches, also when the snapshot
   * fails. After a `failed` install the version folder isn't moved and
   * snapshot errors are only logged, so the install error is kept.
   *
   * @param toolSvc the tool whose version folder is moved, if any
   * @throws when the snapshot of a successful install fails
   */
  private async finish(
    tool: string,
    version: string,
    dryRun: boolean,
    failed: boolean,
    toolSvc: BaseInstallService | undefined,
  ): Promise<void> {
    try {
      if (!dryRun && (await isDockerBuild())) {
        logger.debug({ tool, version }, 'snapshot install');
        if (!failed) {
          await toolSvc?.snapshot(version);
        }
        await this.snapshotSvc.snapshotFiles();
      }
    } catch (err) {
      if (!failed) {
        throw err;
      }
      logger.warn({ err, tool, version }, 'could not update the snapshot');
    } finally {
      await this.cleanup(dryRun);
    }
  }

  /**
   * Removes the apt caches as root, the temp files and the root or user
   * caches at image build time, and evicts the oldest files from the download
   * cache when the disk is too full, see `CacheService.evict`.
   */
  private async cleanup(dryRun: boolean): Promise<void> {
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

  /**
   * Removes a tool version, or every installed version when none is given.
   * A dry run only logs and skips `ensureBasePaths`, so it sets up no tmp
   * link or base folders. At image build time the copies of the removed
   * versions are removed from the snapshot too, and the files outside of the
   * version folders are updated once afterwards.
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

    let failed = true;
    try {
      const res = await this._uninstall(tool, version, dryRun, recursive);
      failed = false;
      return res;
    } finally {
      await this.snapshotUninstall(tool, dryRun, failed);
    }
  }

  /**
   * Updates the files outside of the version folders in the snapshot at the
   * end of a build-time uninstall, except for a dry run, also when it
   * `failed` part-way. Then snapshot errors are only logged, so the uninstall
   * error is kept.
   *
   * @throws when the snapshot of a successful uninstall fails
   */
  private async snapshotUninstall(
    tool: string,
    dryRun: boolean,
    failed: boolean,
  ): Promise<void> {
    if (dryRun || !(await isDockerBuild())) {
      return;
    }
    try {
      await this.snapshotSvc.snapshotFiles();
    } catch (err) {
      if (!failed) {
        throw err;
      }
      logger.warn({ err, tool }, 'could not update the snapshot');
    }
  }

  /**
   * Removes a tool version, or every installed version when none is given,
   * see `uninstall`, and at image build time the snapshot copies of the
   * removed versions.
   *
   * @returns an exit code when the tool could not be uninstalled
   */
  private async _uninstall(
    tool: string,
    version: string | undefined,
    dryRun: boolean,
    recursive: boolean,
  ): Promise<number | void> {
    if (!isNonEmptyStringAndNotWhitespace(version)) {
      const versions = new Set<string>();
      for (const v of await this.versionSvc.findInstalled(tool)) {
        if (versions.has(v.version)) {
          continue;
        }
        versions.add(v.version);
        logger.info(`Uninstalling ${tool}@${v.version}...`);
        const res = await this._uninstall(tool, v.version, dryRun, recursive);
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
            const res = await this._uninstall(
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

        if (await isDockerBuild()) {
          logger.debug({ tool, version }, 'remove snapshot');
          await toolSvc.removeSnapshot(version);
        }
      }
    } else {
      logger.fatal({ tool, version }, 'legacy tools cannot be uninstalled');
      return NotSupported;
    }
  }

  /**
   * Links the version onto the path and records it as the current one, unless
   * it already is. Then runs the post-install step, records the created shell
   * wrappers and runs the tool test, unless tests are skipped.
   */
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
