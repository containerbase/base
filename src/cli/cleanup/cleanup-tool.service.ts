import { inject, injectable, multiInject, optional } from 'inversify';
import type { BaseInstallService } from '../install-tool/base-install.service.ts';
import {
  INSTALL_TOOL_TOKEN,
  InstallToolService,
} from '../install-tool/install-tool.service.ts';
import { EnvService, VersionService } from '../services/index.ts';
import type { Tool } from '../services/version.schema.ts';
import { logger } from '../utils/index.ts';

/** The key of a tool version in sets, eg. `node@22.0.0`. */
function toolKey({ name, version }: Tool): string {
  return `${name}@${version}`;
}

/**
 * The child versions of a tool version, also transitively, from the map of
 * parent version keys to their direct child versions.
 */
function findChilds(tool: Tool, childMap: Map<string, Tool[]>): Tool[] {
  // starts with the tool itself, which ends a cycle
  const found = new Map([[toolKey(tool), tool]]);
  const queue = [tool];
  for (let parent = queue.shift(); parent; parent = queue.shift()) {
    for (const child of childMap.get(toolKey(parent)) ?? []) {
      const key = toolKey(child);
      if (!found.has(key)) {
        found.set(key, child);
        queue.push(child);
      }
    }
  }
  return Array.from(found.values()).slice(1);
}

@injectable()
export class CleanupToolService {
  @multiInject(INSTALL_TOOL_TOKEN)
  @optional()
  private readonly toolSvcs: BaseInstallService[] = [];
  @inject(EnvService)
  private readonly envSvc!: EnvService;
  @inject(InstallToolService)
  private readonly installSvc!: InstallToolService;
  @inject(VersionService)
  private readonly versionSvc!: VersionService;

  /**
   * Uninstalls every installed tool version which is not the linked one of
   * its tool, with all its child versions. The linked version is looked up
   * by the tool name, not by the alias it's linked as, eg. `java-jdk` for
   * `java`.
   *
   * A version is kept with all its child versions when one of them, also
   * transitively, is the linked version of its tool, eg. an unlinked node
   * version with the linked pnpm version installed for it. It's also kept
   * when it or a child version can't be uninstalled, eg. a v1 shell tool or
   * a root only tool when not running as root, or when a child version is
   * kept for another version, as uninstalling removes a version for all
   * parents.
   *
   * A version which fails to uninstall, with an exit code or an error, is
   * logged and the others are still uninstalled.
   *
   * @returns the first exit code of a version which could not be uninstalled,
   * `1` for an error
   */
  async cleanupTools(dryRun = false): Promise<number | void> {
    const tools = await this.versionSvc.listInstalled();
    const linked = new Map(tools.map(({ name, version }) => [name, version]));

    const childMap = new Map<string, Tool[]>();
    for (const { name, versions } of tools) {
      for (const { version, parent } of versions) {
        if (parent) {
          const key = toolKey(parent);
          childMap.set(key, [...(childMap.get(key) ?? []), { name, version }]);
        }
      }
    }

    const candidates: { tool: Tool; childs: Tool[] }[] = [];
    for (const { name, version: current, versions } of tools) {
      for (const version of new Set(versions.map((v) => v.version))) {
        if (version !== current) {
          const tool = { name, version };
          candidates.push({ tool, childs: findChilds(tool, childMap) });
        }
      }
    }

    const kept = new Set<string>();
    /** Keeps the version with its child versions and logs why. */
    const keep = (tool: Tool, childs: Tool[], reason: string): void => {
      logger.info(
        { tool: tool.name, version: tool.version },
        `keeping unlinked tool version, ${reason}`,
      );
      for (const t of [tool, ...childs]) {
        kept.add(toolKey(t));
      }
    };
    for (const { tool, childs } of candidates) {
      if (childs.some((child) => linked.get(child.name) === child.version)) {
        keep(tool, childs, 'a child tool version is linked');
      } else if (![tool, ...childs].every((t) => this.canUninstall(t.name))) {
        keep(tool, childs, 'it or a child tool cannot be uninstalled');
      }
    }
    // keeping a version can keep the versions it's a child of
    for (let changed = true; changed;) {
      changed = false;
      for (const { tool, childs } of candidates) {
        if (
          !kept.has(toolKey(tool)) &&
          childs.some((child) => kept.has(toolKey(child)))
        ) {
          keep(tool, childs, 'a child tool version is kept');
          changed = true;
        }
      }
    }

    const removed = new Set<string>();
    const failed: string[] = [];
    let code: number | undefined;
    for (const { tool, childs } of candidates) {
      const key = toolKey(tool);
      if (kept.has(key) || removed.has(key)) {
        continue;
      }
      logger.info(`Uninstalling unlinked tool ${key}...`);
      let res: number | void;
      try {
        res = await this.installSvc.uninstall(
          tool.name,
          tool.version,
          dryRun,
          true,
        );
      } catch (err) {
        logger.warn(
          { tool: tool.name, version: tool.version, err },
          'cannot uninstall unlinked tool version',
        );
        res = 1;
      }
      if (res) {
        failed.push(key);
        code ??= res;
        continue;
      }
      for (const t of [tool, ...childs]) {
        removed.add(toolKey(t));
      }
    }
    if (failed.length) {
      logger.warn({ tools: failed }, 'unlinked tool versions left installed');
    }
    return code;
  }

  /**
   * Whether the tool can be uninstalled, which v1 shell tools, tools like
   * `git` and root only tools when not running as root can't.
   */
  private canUninstall(name: string): boolean {
    const toolSvc = this.toolSvcs.find((t) => t.name === name);
    return (
      !!toolSvc &&
      toolSvc.canUninstall &&
      (!toolSvc.needsRoot || this.envSvc.isRoot)
    );
  }
}
