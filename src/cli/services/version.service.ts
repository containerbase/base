import { join } from 'node:path';
import Datastore from '@seald-io/nedb';
import { inject, injectable, postConstruct } from 'inversify';
import { DataService } from './data.service';
import { PathService } from './path.service';

export type Doc<T> = T & {
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

  tool?: Tool;
}

export interface ToolLink {
  name: string;

  tool: Tool;
}

export interface ToolCurrent {
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

  private _links!: Datastore<Doc<ToolLink>>;
  private _tools!: Datastore<Doc<ToolCurrent>>;
  private _versions!: Datastore<Doc<ToolVersion>>;

  async isInstalled(tool: ToolVersion): Promise<boolean> {
    return (await this._versions.findOneAsync(tool)) !== null;
  }

  async addInstalled(tool: ToolVersion): Promise<void> {
    await this._versions.insertAsync(tool);
  }

  async removeInstalled(tool: Partial<ToolVersion>): Promise<void> {
    await this._versions.removeAsync(tool, { multi: true });
  }

  async isLinked(tool: ToolLink): Promise<boolean> {
    return (await this._links.findOneAsync(tool)) !== null;
  }

  async setLink(tool: ToolLink): Promise<void> {
    await this._links.updateAsync({ name: tool.name }, tool, { upsert: true });
  }

  async isCurrent(tool: ToolCurrent): Promise<boolean> {
    return (await this._tools.findOneAsync(tool)) !== null;
  }

  async setCurrent(tool: ToolCurrent): Promise<void> {
    await this._tools.updateAsync({ name: tool.name }, tool, { upsert: true });
  }

  async getCurrent(name: string): Promise<ToolCurrent | null> {
    return await this._tools.findOneAsync({ name });
  }

  @postConstruct()
  protected async [Symbol('construct')](): Promise<void> {
    const [links, tools, versions] = await Promise.all([
      this.dataSvc.load(join(this.pathSvc.dataPath, 'links.nedb')),
      this.dataSvc.load(join(this.pathSvc.dataPath, 'tools.nedb')),
      this.dataSvc.load(join(this.pathSvc.dataPath, 'versions.nedb')),
    ])
    this._links = links;
    this._tools = tools;
    this._versions = versions;


    await links.ensureIndexAsync({ fieldName: 'name', unique: true });
    await links.ensureIndexAsync({
      fieldName: ['tool.name', 'tool.version'],
      sparse: true,
    });

    await tools.ensureIndexAsync({ fieldName: 'name', unique: true });

    await versions.ensureIndexAsync({ fieldName: 'name' });
    await versions.ensureIndexAsync({ fieldName: ['name', 'version'] });
    await versions.ensureIndexAsync({
      fieldName: ['tool.name', 'tool.version'],
      sparse: true,
    });
    await versions.ensureIndexAsync({
      fieldName: ['name', 'version', 'tool.name', 'tool.version'],
      unique: true,
    });
  }
}
