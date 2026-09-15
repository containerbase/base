import { chmod, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable, postConstruct } from 'inversify';
import type { InstallToolType } from '../utils';
import { fileRights, logger, tool2path } from '../utils/index.ts';
import { DataService, type Database } from './data.service.ts';
import { PathService } from './path.service.ts';

export type Doc<T> = T & {
  _id?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export interface Tool {
  name: string;
  version: string;
}

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

export interface InstalledTool {
  name: string;

  /**
   * The currently linked version, `null` if the tool isn't linked.
   */
  version: string | null;

  /**
   * All installed versions, sorted ascending.
   */
  versions: string[];

  /**
   * The installer type, only set for dynamically installed tools.
   */
  type?: InstallToolType;
}

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

  async isInstalled(tool: ToolVersion): Promise<boolean> {
    return (await this._versions.findOneAsync(tool)) !== null;
  }

  findInstalled(name: string): Promise<Doc<ToolVersion>[]> {
    return this._versions.findAsync({ name });
  }

  /**
   * Lists all installed tools with their versions, sorted by tool name.
   */
  async listInstalled(): Promise<InstalledTool[]> {
    const [versions, states, types] = await Promise.all([
      this._versions.findAsync({}),
      this._state.findAsync({}),
      this._types.findAsync({}),
    ]);

    const tools = new Map<string, Set<string>>();
    for (const { name, version } of versions) {
      let set = tools.get(name);
      if (!set) {
        tools.set(name, (set = new Set()));
      }
      set.add(version);
    }

    return Array.from(tools.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, versions]) => {
        const type = types.find((t) => t.name === name)?.type;
        return {
          name,
          version: states.find((s) => s.name === name)?.tool.version ?? null,
          versions: Array.from(versions).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true }),
          ),
          ...(type ? { type } : {}),
        };
      });
  }

  async addInstalled(tool: ToolVersion): Promise<void> {
    await this._versions.insertAsync(tool);
  }

  async removeInstalled(tool: Partial<ToolVersion>): Promise<void> {
    await this._versions.removeAsync(tool, { multi: true });
  }

  getChilds(parent: Tool): Promise<Doc<ToolVersion>[]> {
    return this._versions.findAsync({ parent });
  }

  async isLinked(tool: ToolLink): Promise<boolean> {
    return (await this._links.findOneAsync(tool)) !== null;
  }

  findLinks(tool: Tool): Promise<Doc<ToolLink>[]> {
    return this._links.findAsync({ tool });
  }

  async setLink(tool: ToolLink): Promise<void> {
    await this._links.updateAsync({ name: tool.name }, tool, { upsert: true });
  }

  async removeLinks(tool: Tool): Promise<void> {
    await this._links.removeAsync({ tool }, { multi: true });
  }

  async isCurrent(tool: ToolState): Promise<boolean> {
    return (await this._state.findOneAsync(tool)) !== null;
  }

  async setCurrent(tool: ToolState): Promise<void> {
    await this._state.updateAsync({ name: tool.name }, tool, { upsert: true });
  }

  async getCurrent(name: string): Promise<ToolState | null> {
    return await this._state.findOneAsync({ name });
  }

  async removeCurrent(name: string): Promise<void> {
    await this._state.removeAsync({ name }, { multi: false });
    const path = join(this.pathSvc.versionPath, tool2path(name));
    try {
      await rm(path);
    } catch (err) {
      logger.error({ tool: name, err }, 'tool version file not found');
    }
  }

  async getType(name: string): Promise<InstallToolType | undefined> {
    const doc = await this._types.findOneAsync({ name });
    return doc?.type;
  }

  async getTypes(): Promise<ToolType[]> {
    return await this._types.findAsync({});
  }

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
