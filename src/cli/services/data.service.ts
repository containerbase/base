import type Nedb from '@seald-io/nedb';
import Datastore from '@seald-io/nedb';
import { bindingScopeValues, injectable } from 'inversify';

export type Database<T> = Nedb<T>;

@injectable(bindingScopeValues.Singleton)
export class DataService {
  private readonly _stores: Record<string, Promise<Database<unknown>>> = {};

  load<T>(filename: string): Promise<Database<T>> {
    return (this._stores[filename] ??= this._load(filename));
  }

  private async _load<T>(filename: string): Promise<Database<T>> {
    const db = new Datastore({
      filename,
      timestampData: true,
      modes: { fileMode: 0o664, dirMode: 0o775 },
    });

    await db.loadDatabaseAsync();

    return db;
  }
}
