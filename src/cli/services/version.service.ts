import { chmod, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable, postConstruct } from 'inversify';
import type { InstallToolType } from '../utils';
import { fileRights, logger, tool2path } from '../utils/index.ts';
import { DataService, type Database } from './data.service.ts';
import { PathService } from './path.service.ts';
import type {
  InstalledTool,
  InstalledToolVersion,
  Tool,
} from './version.schema.ts';

export type Doc<T> = T & {
  _id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export interface ToolVersion {
  name: string;
  version: string;

  parent?: Tool;
}

export interface ToolLink {
  name: string;

  tool: Tool;
}

export interface ToolState {
  name: string;
  tool: Tool;
  parent?: Tool;
}

export interface ToolType {
  name: string;
  type: InstallToolType;
}

/**
 * Keeps track of the installed tools in four separate stores:
 *
 * - versions: every installed version, a tool can have many, each optionally
 *   installed for a parent tool version, eg. a npm package for a node version
 * - state: the current version per tool, the one on the path
 * - links: the shell wrapper names created for a tool version
 * - types: the installer of dynamically installed tools, eg. `npm`
 */
@injectable()
export class VersionService {
  @inject(DataService)
  private readonly dataSvc!: DataService;

  @inject(PathService)
  private readonly pathSvc!: PathService;

  private _links!: Database<Doc<ToolLink>>;
  private _state!: Database<Doc<ToolState>>;
  private _types!: Database<Doc<ToolType>>;
  private _versions!: Database<Doc<ToolVersion>>;

  /**
   * Whether exactly this version is recorded, including its parent when given.
   */
  async isInstalled(tool: ToolVersion): Promise<boolean> {
    return (await this._versions.findOneAsync(tool)) !== null;
  }

  /** All recorded versions of a tool, for any parent. */
  findInstalled(name: string): Promise<Doc<ToolVersion>[]> {
    return this._versions.findAsync({ name });
  }

  /**
   * Lists all installed tools with their versions, sorted by tool name.
   *
   * The current version is looked up by `tool.name`, because tools are linked
   * under their alias, eg. `java-jdk` is linked as `java`.
   */
  async listInstalled(): Promise<InstalledTool[]> {
    const [versions, states, types] = await Promise.all([
      this._versions.findAsync({}),
      this._state.findAsync({}),
      this._types.findAsync({}),
    ]);

    const tools = new Map<string, InstalledToolVersion[]>();
    for (const { name, version, parent } of versions) {
      let installed = tools.get(name);
      if (!installed) {
        tools.set(name, (installed = []));
      }
      installed.push(parent ? { version, parent } : { version });
    }

    return Array.from(tools.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([name, versions]) => {
        const type = types.find((t) => t.name === name)?.type;
        return {
          name,
          version:
            states.find((s) => s.tool.name === name)?.tool.version ?? null,
          versions: versions.sort((a, b) =>
            a.version.localeCompare(b.version, undefined, { numeric: true }),
          ),
          ...(type ? { type } : {}),
        };
      });
  }

  /** Records an installed version. */
  async addInstalled(tool: ToolVersion): Promise<void> {
    await this._versions.insertAsync(tool);
  }

  /** Removes every recorded version matching the given fields. */
  async removeInstalled(tool: Partial<ToolVersion>): Promise<void> {
    await this._versions.removeAsync(tool, { multi: true });
  }

  /**
   * The versions installed for exactly this parent version. Children of other
   * versions of the same parent tool are not included.
   */
  getChilds(parent: Tool): Promise<Doc<ToolVersion>[]> {
    return this._versions.findAsync({ parent });
  }

  /** Whether the shell wrapper name points at exactly this tool version. */
  async isLinked(tool: ToolLink): Promise<boolean> {
    return (await this._links.findOneAsync(tool)) !== null;
  }

  /** The shell wrapper names created for a tool version. */
  findLinks(tool: Tool): Promise<Doc<ToolLink>[]> {
    return this._links.findAsync({ tool });
  }

  /**
   * Points a shell wrapper name at a tool version, replacing whatever it
   * pointed at before.
   */
  async setLink(tool: ToolLink): Promise<void> {
    await this._links.updateAsync({ name: tool.name }, tool, { upsert: true });
  }

  /** Forgets every shell wrapper name created for a tool version. */
  async removeLinks(tool: Tool): Promise<void> {
    await this._links.removeAsync({ tool }, { multi: true });
  }

  /** Whether exactly this version, and parent, is the current one. */
  async isCurrent(tool: ToolState): Promise<boolean> {
    return (await this._state.findOneAsync(tool)) !== null;
  }

  /** Makes a version the current one, replacing the previous current one. */
  async setCurrent(tool: ToolState): Promise<void> {
    await this._state.updateAsync({ name: tool.name }, tool, { upsert: true });
  }

  /**
   * The current version, looked up by the name the tool is linked as, which
   * is its alias, eg. `java` for `java-jdk`.
   */
  async getCurrent(name: string): Promise<ToolState | null> {
    return await this._state.findOneAsync({ name });
  }

  /** Forgets the current version and removes its legacy version file. */
  async removeCurrent(name: string): Promise<void> {
    await this._state.removeAsync({ name }, { multi: false });
    const path = join(this.pathSvc.versionPath, tool2path(name));
    try {
      await rm(path);
    } catch (err) {
      logger.error({ tool: name, err }, 'tool version file not found');
    }
  }

  /** The installer a dynamically installed tool was installed with. */
  async getType(name: string): Promise<InstallToolType | undefined> {
    const doc = await this._types.findOneAsync({ name });
    return doc?.type;
  }

  /** Every dynamically installed tool with its installer. */
  async getTypes(): Promise<ToolType[]> {
    return await this._types.findAsync({});
  }

  /** Records the installer of a dynamically installed tool. */
  async setType(
    name: string,
    type: InstallToolType | undefined,
  ): Promise<void> {
    await this._types.updateAsync({ name }, { name, type }, { upsert: true });
  }

  /**
   * Required for v2 tool to find parent tool version
   * @param tool
   * @param version
   * @deprecated legacy v2 tools compability
   */
  async update(tool: string, version: string): Promise<void> {
    const path = join(this.pathSvc.versionPath, tool2path(tool));
    try {
      await writeFile(path, version, { encoding: 'utf8' });
      const s = await stat(path);
      if ((s.mode & fileRights) !== 0o664) {
        await chmod(path, 0o664);
      }
    } catch (err) {
      logger.error({ tool, err }, 'tool version not found');
    }
  }

  @postConstruct()
  protected async [Symbol('construct')](): Promise<void> {
    const [links, state, types, versions] = await Promise.all([
      this.dataSvc.load('links'),
      this.dataSvc.load('state'),
      this.dataSvc.load('types'),
      this.dataSvc.load('versions'),
    ]);
    this._links = links;
    this._state = state;
    this._types = types;
    this._versions = versions;

    await links.ensureIndexAsync({ fieldName: 'name', unique: true });
    await links.ensureIndexAsync({
      fieldName: ['tool.name', 'tool.version'],
      sparse: true,
    });

    await state.ensureIndexAsync({ fieldName: 'name', unique: true });

    await types.ensureIndexAsync({ fieldName: 'name', unique: true });

    await versions.ensureIndexAsync({ fieldName: 'name' });
    await versions.ensureIndexAsync({ fieldName: ['name', 'version'] });
    await versions.ensureIndexAsync({
      fieldName: ['parent.name', 'parent.version'],
      sparse: true,
    });
    await versions.ensureIndexAsync({
      fieldName: ['name', 'version', 'parent.name', 'parent.version'],
      unique: true,
    });
  }
}
