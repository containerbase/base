import { join } from 'node:path';
import type Nedb from '@seald-io/nedb';
import Datastore from '@seald-io/nedb';
import { bindingScopeValues, inject, injectable } from 'inversify';
import { PathService } from './path.service.ts';

export type Database<T = unknown> = Pick<
  Nedb<T>,
  | 'ensureIndexAsync'
  | 'findAsync'
  | 'findOneAsync'
  | 'insertAsync'
  | 'removeAsync'
  | 'updateAsync'
> & {
  /** The path of the database file. */
  get filename(): string;
};

class DatabaseWrapper extends Datastore {
  declare public readonly filename: string;

  /** Opens the `<name>.nedb` database in the containerbase data folder. */
  constructor(
    private readonly _pathSvc: PathService,
    name: string,
  ) {
    super({
      filename: join(_pathSvc.dataPath, `${name}.nedb`),
      timestampData: true,
      modes: {
        dirMode: 0o775,
        fileMode: 0o664,
      },
    });
  }

  /** Loads the database and fixes the ownership of its file. */
  override async loadDatabaseAsync(): Promise<void> {
    await super.loadDatabaseAsync();
    await this._sync();
  }

  /** Compacts the database file and fixes its ownership. */
  override async compactDatafileAsync(): Promise<void> {
    await super.compactDatafileAsync();
    await this._sync();
  }

  /** Gives the configured user ownership of the database file. */
  private async _sync(): Promise<void> {
    await this._pathSvc.setOwner({
      path: this.filename,
      mode: 0o664,
    });
  }
}

@injectable(bindingScopeValues.Singleton)
export class DataService {
  private readonly _stores: Record<string, Promise<Database<unknown>>> = {};

  @inject(PathService)
  private readonly pathSvc!: PathService;

  /** Returns the named database, loading it on first use. */
  load<T>(name: string): Promise<Database<T>> {
    return (this._stores[name] ??= this._load(name));
  }

  /** Opens and loads the named database. */
  private async _load<T>(name: string): Promise<Database<T>> {
    const db = new DatabaseWrapper(this.pathSvc, name);

    await db.loadDatabaseAsync();

    return db;
  }
}
