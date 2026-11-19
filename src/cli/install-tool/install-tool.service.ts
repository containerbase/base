import fs from 'node:fs/promises';
import path from 'node:path';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { deleteAsync } from 'del';
import { inject, injectable, multiInject, optional } from 'inversify';
import { initializeTools, prepareTools } from '../prepare-tool/index.ts';
import {
  type BuildListCurrent,
  type BuildListEntry,
  type BuildListInstall,
  type BuildListLink,
  BuildListService,
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
  CommandNotFound,
  MissingParent,
  NotRoot,
  NotSupported,
} from '../utils/codes.ts';
import {
  cleanAptFiles,
  cleanTmpFiles,
  isDockerBuild,
  listEntries,
  logger,
  removePath,
} from '../utils/index.ts';
import type { BaseInstallService } from './base-install.service';
import {
  V1ToolInstallService,
  V2ToolInstallService,
} from './install-legacy-tool.service.ts';

export const INSTALL_TOOL_TOKEN = Symbol('INSTALL_TOOL_TOKEN');

/**
 * The parent versions the list has for the version a link points at: only the
 * parent of the `c` line when it is the current version of the tool, none for
 * a tool without a parent. A link to a version which isn't current falls back
 * to the parents on the `i` lines of that version, the newest first like
 * `VersionService.findParentVersions`.
 */
function listedParents(
  entries: readonly BuildListEntry[],
  currents: ReadonlyMap<string, BuildListCurrent>,
  { tool, version }: BuildListLink,
): string[] {
  const current = currents.get(tool);
  if (current?.version === version) {
    return current.parent ? [current.parent.version] : [];
  }
  return entries
    .flatMap((entry) =>
      entry.kind === 'i' &&
      entry.tool === tool &&
      entry.version === version &&
      entry.parent
        ? [entry.parent.version]
        : [],
    )
    .toReversed();
}

@injectable()
export class InstallToolService {
  @inject(V1ToolInstallService)
  private readonly legacySvc!: V1ToolInstallService;
  @multiInject(INSTALL_TOOL_TOKEN)
  @optional()
  private readonly toolSvcs: BaseInstallService[] = [];
  @inject(BuildListService)
  private readonly _list!: BuildListService;
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
   * install, link and test. Before the install it installs the current parent
   * version again when its files are missing, see `restoreMissingParent`.
   * Afterwards the oldest files are evicted from the download cache when the
   * disk is too full, see `CacheService.evict`. A failing eviction is only
   * logged.
   *
   * @returns an exit code when the tool could not be installed, which can also
   * be the one of the parent version which could not be installed again
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
          const res = await this.restoreMissingParent(parent);
          if (res) {
            return res;
          }
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
      await this.cleanAfterInstall(dryRun);
    }
  }

  /**
   * Installs the current parent version of a tool again when its files are
   * missing, eg. on a volume set up from the build-time list, as the tools of
   * a child, like npm packages, call the parent by its path and not through
   * its shim. The link state is cleared afterwards, as the restore sets its
   * own.
   *
   * @returns an exit code when the parent can't be installed
   */
  private async restoreMissingParent(
    parent: ToolState | null,
  ): Promise<number | void> {
    const parentSvc = parent
      ? this.toolSvcs.find((t) => t.name === parent.tool.name)
      : undefined;
    if (
      !parent ||
      !parentSvc ||
      !(await this.isMissing(parentSvc, parent.tool.version))
    ) {
      return;
    }
    logger.info(
      { tool: parentSvc.name, version: parent.tool.version },
      'parent tool version missing, installing',
    );
    const res = await this.restore(parentSvc, parent.tool.version);
    this._link.clear();
    return res;
  }

  /**
   * Cleans up after an install: the apt files as root, on a docker build the
   * tmp files and the caches, then the oldest files are evicted from the
   * download cache, see `evictCache`.
   */
  private async cleanAfterInstall(dryRun: boolean): Promise<void> {
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
        if (!dryRun) {
          await this.cleanUserCaches();
        }
      }
    }

    await this.evictCache(dryRun);
  }

  /**
   * Removes the contents of the user `.cache` folder and the virtualenv cache.
   * Read-only folders, eg. the virtualenv seed packages, are made writable
   * first.
   */
  private async cleanUserCaches(): Promise<void> {
    const { cachePath } = this.pathSvc;
    for (const entry of [
      ...(await listEntries(path.join(cachePath, '.cache'))),
      path.join(cachePath, '.local/share/virtualenv'),
    ]) {
      await removePath(entry);
    }
  }

  /**
   * Evicts the oldest files from the download cache when the disk is too
   * full, see `CacheService.evict`. A failing eviction is only logged, as it
   * must not change the result of the install.
   */
  private async evictCache(dryRun: boolean): Promise<void> {
    try {
      await this.cacheSvc.evict(dryRun);
    } catch (err) {
      logger.warn({ err }, 'cannot evict the download cache');
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
        // the current version is stored under the alias, eg. `java` for `java-jre`
        if (
          await this.versionSvc.isCurrent({
            name: toolSvc.alias,
            tool: vTool,
          })
        ) {
          await this.versionSvc.removeCurrent(toolSvc.alias);
        }

        for (const { name } of await this.versionSvc.findLinks(vTool)) {
          await this._link.rm(name);
        }

        await this.versionSvc.removeLinks(vTool);

        if (await this.isBuildTime()) {
          await this._list.remove(tool, version);
        }
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
   * Makes a command of an installed tool run again, called by its shim when
   * the pointer of the command is missing or dangling. It never changes which
   * version any command runs: it recreates the pointer when the per-version
   * wrapper exists, else it installs the version the command points at again,
   * after its parent, and writes the per-version wrappers. When the version is
   * the current one of a tool with a parent, only the wrapper for the parent of
   * the current record counts, else any recorded parent does. After an install
   * it only evicts the download cache, it removes no apt, tmp or cache files,
   * as it runs inside the command which called the shim.
   *
   * @returns an exit code when the command can't be restored
   * @throws when the install fails, the partial version folder is removed so
   * the next call tries again
   */
  async ensure(command: string): Promise<number | void> {
    await this.pathSvc.ensureBasePaths();

    const link = await this.versionSvc.findLink(command);
    if (!link) {
      logger.error(
        { command },
        'command not installed, run install-tool <tool> <version>',
      );
      return CommandNotFound;
    }

    const { name: tool, version } = link.tool;
    const toolSvc = this.toolSvcs.find((t) => t.name === tool);
    if (
      await this._link.restorePointer(
        command,
        link.tool,
        // a parent version of an older volume must not win over the current one
        await this.versionSvc.findSelectedParents(
          link.tool,
          toolSvc?.alias ?? tool,
        ),
      )
    ) {
      logger.debug({ command, tool, version }, 'pointer restored');
      return;
    }

    if (!toolSvc || toolSvc instanceof V2ToolInstallService) {
      logger.error({ command, tool }, 'tool cannot be installed again');
      return NotSupported;
    }
    return await this.restore(toolSvc, version);
  }

  /**
   * Sets up an empty or older `/opt/containerbase` from the build-time list of
   * the image: the version records, the types of the packages, the current
   * versions, the links with their shims and the legacy version files. The
   * versions of the image win over the ones installed at runtime, as they are
   * recorded last, and only the `c` lines make a version current. Nothing is
   * removed, and no tool is installed, the shims install a version on its
   * first call, see `ensure`. Only jq is restored at once, as the other tools
   * and the shell utils need it early, git is installed by apt and never
   * restored. The initialized markers in the temp folder are cleared, as they
   * outlive the volume, so the init which follows runs every initialize step
   * again. At last the list is copied to the volume, so the next init has
   * nothing to do.
   */
  async setupVolume(): Promise<void> {
    await this.pathSvc.ensureBasePaths();
    await this.pathSvc.clearInitialized();

    // the whole list first, so a link knows the current parent of its tool
    // wherever the `c` line is
    const entries = await this._list.read();
    const currents = new Map<string, BuildListCurrent>();
    for (const entry of entries) {
      if (entry.kind === 'c') {
        currents.set(entry.tool, entry);
      }
    }

    for (const entry of entries) {
      if (entry.kind === 'i') {
        await this.replayInstall(entry);
      } else if (entry.kind === 'c') {
        await this.replayCurrent(entry);
      } else {
        await this.replayLink(entry, listedParents(entries, currents, entry));
      }
    }

    const jqVersion = currents.get('jq')?.version;
    const jqSvc = this.toolSvcs.find((t) => t.name === 'jq');
    if (jqVersion && jqSvc && (await this.isMissing(jqSvc, jqVersion))) {
      try {
        await this.restore(jqSvc, jqVersion);
      } catch (err) {
        logger.warn(
          { err, tool: 'jq' },
          'cannot restore the tool, the shim retries',
        );
      }
    }

    await this._list.copyToVolume();
  }

  /** Records a listed install in the databases, and the type of a package. */
  private async replayInstall(entry: BuildListInstall): Promise<void> {
    const { tool, version, parent } = entry;
    const record = { name: tool, version, ...(parent && { parent }) };
    if (!(await this.versionSvc.isInstalled(record))) {
      await this.versionSvc.addInstalled(record);
    }
    if (entry.type !== 'tool' && !this.toolSvcs.some((t) => t.name === tool)) {
      // a package without an install service of its own
      await this.versionSvc.setType(tool, entry.type);
    }
  }

  /**
   * Makes a listed version the current one of its tool and writes its legacy
   * version file.
   */
  private async replayCurrent(entry: BuildListCurrent): Promise<void> {
    const { alias, tool, version, parent } = entry;
    await this.versionSvc.setCurrent({
      name: alias,
      tool: { name: tool, version },
      ...(parent && { parent }),
    });
    await this.versionSvc.update(tool, version);
  }

  /**
   * Records a listed link, writes the shim of the command and points it at
   * the wrapper of its version for one of the listed parent versions, when
   * that exists, or else removes the pointer, so the shim installs the
   * version on its first call. Parent versions recorded on the volume are
   * not used, as the image may list another one.
   *
   * @param parents - the parent versions the list has for the linked version
   */
  private async replayLink(
    entry: BuildListLink,
    parents: readonly string[],
  ): Promise<void> {
    const { command, tool, version } = entry;
    const link = { name: tool, version };
    await this.versionSvc.setLink({ name: command, tool: link });
    await this._link.writeShim(command);
    if (!(await this._link.restorePointer(command, link, parents))) {
      await this._link.removeStalePointer(command, true);
    }
  }

  /**
   * Installs the version again, after the current parent version when its
   * files are missing too, and writes only the per-version wrappers. The
   * commands which point at the version are pointed at the new wrappers, as
   * the parent folder may have changed. Shims, links store, current versions
   * and the tool test are left alone, and so is the record for the parent
   * version it was installed for. A tool with a parent is also recorded for
   * the current parent version when that record is missing, so uninstalling
   * that parent sees the child. The download cache is evicted after an
   * install, also a failed one.
   *
   * @returns an exit code when the version can't be installed
   */
  private async restore(
    toolSvc: BaseInstallService,
    version: string,
  ): Promise<number | void> {
    const tool = toolSvc.name;
    if (toolSvc.needsRoot && !this.envSvc.isRoot) {
      logger.fatal({ tool }, 'tool must be installed as root');
      return NotRoot;
    }

    let parent: ToolState | null = null;
    if (toolSvc.parent) {
      parent = await this.versionSvc.getCurrent(toolSvc.parent);
      if (!parent) {
        logger.fatal(
          { tool, parent: toolSvc.parent },
          'parent tool not installed',
        );
        return MissingParent;
      }
      const res = await this.restoreMissingParent(parent);
      if (res) {
        return res;
      }
    }

    const dir = toolSvc.versionDir(version, parent?.tool.version);
    this._link.clear();
    this._link.setContext({ tool, version, dir, restore: true });
    let installed = false;
    try {
      if (!(await toolSvc.isInstalled(version))) {
        if (toolSvc.needsInitialize() && !(await toolSvc.isInitialized())) {
          logger.debug({ tool }, 'tool not initialized');
          const res = await initializeTools([tool]);
          if (res) {
            return res;
          }
        }
        logger.info({ tool, version }, 'tool version missing, installing');
        installed = true;
        await toolSvc.install(version);
      }
      await toolSvc.link(version);
      await toolSvc.postInstall(version);

      for (const { name } of await this.versionSvc.findLinks({
        name: tool,
        version,
      })) {
        await this._link.point(name);
      }

      // the files belong to the current parent, which may not be the one the
      // version was recorded for, so its uninstall sees the child
      if (parent) {
        const record = { name: tool, version, parent: parent.tool };
        if (!(await this.versionSvc.isInstalled(record))) {
          await this.versionSvc.addInstalled(record);
        }
      }
    } catch (err) {
      if (installed) {
        await fs.rm(dir, { recursive: true, force: true });
      }
      throw err;
    } finally {
      if (installed) {
        // only the download cache, it runs inside the command of the user
        await this.evictCache(false);
      }
    }
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

      await this.recordBuildTimeInstall(toolSvc, version, parent);
    } finally {
      this._link.resetContext();
    }
  }

  /**
   * Whether the install runs as root during an image build, so it is part of
   * the image, see `BuildListService`.
   */
  private async isBuildTime(): Promise<boolean> {
    return this.envSvc.isRoot && (await isDockerBuild());
  }

  /**
   * Records an install of an image build in the build-time list, with the
   * commands the version linked, as the current version of the tool. The v2
   * shell tools can't be installed again by the shims, so they are not listed.
   */
  private async recordBuildTimeInstall(
    toolSvc: BaseInstallService,
    version: string,
    parent: ToolState | null,
  ): Promise<void> {
    if (
      toolSvc instanceof V2ToolInstallService ||
      !(await this.isBuildTime())
    ) {
      return;
    }
    const links = await this.versionSvc.findLinks({
      name: toolSvc.name,
      version,
    });
    await this._list.record(
      {
        type: toolSvc.type && toolSvc.type !== 'dotnet' ? toolSvc.type : 'tool',
        tool: toolSvc.name,
        version,
        ...(parent && { parent: parent.tool }),
      },
      links.map(({ name }) => name).toSorted(),
      toolSvc.alias,
    );
  }

  /**
   * Records which shell wrappers the last link step created, so they can be
   * removed again when the version is uninstalled, and points the commands at
   * their wrappers. The pointers are written before the tool test runs.
   */
  private async _storeLinks(tool: string, version: string): Promise<void> {
    const links = this._link.links;
    logger.debug({ tool, version, links }, 'linked tools');

    for (const name of links) {
      await this.versionSvc.setLink({
        name,
        tool: { name: tool, version },
      });
      await this._link.point(name);
    }
  }
}
