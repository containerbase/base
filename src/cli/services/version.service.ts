import { chmod, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inject, injectable, postConstruct } from 'inversify';
import { fileRights, logger, tool2path } from '../utils';
import { DataService, type Database } from './data.service';
import { PathService } from './path.service';

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

@injectable()
export class VersionService {
  @inject(DataService)
  private readonly dataSvc!: DataService;

  @inject(PathService)
  private readonly pathSvc!: PathService;

  private _links!: Database<Doc<ToolLink>>;
  private _state!: Database<Doc<ToolState>>;
  private _versions!: Database<Doc<ToolVersion>>;

  async isInstalled(tool: ToolVersion): Promise<boolean> {
    return (await this._versions.findOneAsync(tool)) !== null;
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
    const [links, state, versions] = await Promise.all([
      this.dataSvc.load('links'),
      this.dataSvc.load('state'),
      this.dataSvc.load('versions'),
    ]);
    this._links = links;
    this._state = state;
    this._versions = versions;

    await links.ensureIndexAsync({ fieldName: 'name', unique: true });
    await links.ensureIndexAsync({
      fieldName: ['tool.name', 'tool.version'],
      sparse: true,
    });

    await state.ensureIndexAsync({ fieldName: 'name', unique: true });

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
