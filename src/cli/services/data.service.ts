import fs from 'node:fs/promises';
import { join } from 'node:path';
import type Nedb from '@seald-io/nedb';
import Datastore from '@seald-io/nedb';
import { bindingScopeValues, inject, injectable } from 'inversify';
import { logger } from '../utils/index.ts';
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

  /**
   * nedb's persistence, typed with the internal methods which rewrite the
   * whole database file, called at the end of every load, and which append to
   * it, called on every change and index creation.
   * Typed as properties, as they are swapped out for a read-only database.
   */
  declare public persistence: Nedb.Persistence & {
    persistCachedDatabaseAsync: () => Promise<void>;
    persistNewStateAsync: (docs: unknown[]) => Promise<void>;
  };

  /**
   * Opens the `<name>.nedb` database in the containerbase data folder.
   * A read-only database is loaded without writing to its file.
   */
  constructor(
    private readonly _pathSvc: PathService,
    name: string,
    private readonly _readOnly: boolean,
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

  /**
   * Loads the database and fixes the ownership of its file.
   * A read-only database is loaded without compacting its file and without
   * fixing the ownership.
   */
  override async loadDatabaseAsync(): Promise<void> {
    if (!this._readOnly) {
      await super.loadDatabaseAsync();
      await this._sync();
      return;
    }

    logger.debug({ file: this.filename }, 'opening database read-only');
    const { persistence } = this;
    const compact = persistence.persistCachedDatabaseAsync;
    // skip the compaction, nedb has no option to load without it
    persistence.persistCachedDatabaseAsync = () => Promise.resolve();
    try {
      await super.loadDatabaseAsync();
    } finally {
      persistence.persistCachedDatabaseAsync = compact;
    }
  }

  /**
   * Creates the index. For a read-only database the index is only created in
   * memory, nedb would append it to the file when the file has none yet.
   */
  override async ensureIndexAsync(
    options: Nedb.EnsureIndexOptions,
  ): Promise<void> {
    if (!this._readOnly) {
      await super.ensureIndexAsync(options);
      return;
    }

    const { persistence } = this;
    const persist = persistence.persistNewStateAsync;
    // skip the append, nedb has no option to create an index without it
    persistence.persistNewStateAsync = () => Promise.resolve();
    try {
      await super.ensureIndexAsync(options);
    } finally {
      persistence.persistNewStateAsync = persist;
    }
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
  private _readOnly: Promise<boolean> | undefined;

  @inject(PathService)
  private readonly pathSvc!: PathService;

  /**
   * Opens the databases read-only, also when the data folder is writable, for
   * commands which only read. Call it before the first database is loaded:
   * databases which are already loaded stay as they are, only the ones loaded
   * afterwards are opened read-only.
   */
  readOnly(): void {
    this._readOnly = Promise.resolve(true);
  }

  /** Returns the named database, loading it on first use. */
  load<T>(name: string): Promise<Database<T>> {
    return (this._stores[name] ??= this._load(name));
  }

  /**
   * Opens and loads the named database, read-only when requested with
   * `readOnly()` or when the data folder is not writable.
   */
  private async _load<T>(name: string): Promise<Database<T>> {
    const db = new DatabaseWrapper(
      this.pathSvc,
      name,
      await this._isReadOnly(),
    );

    await db.loadDatabaseAsync();

    return db;
  }

  /**
   * Whether the data folder is not writable, eg. on a read-only file system.
   * Other errors, like a missing folder, count as writable, so nedb creates
   * the folder and files as before. Checked once for all databases.
   */
  private _isReadOnly(): Promise<boolean> {
    return (this._readOnly ??= fs
      .access(this.pathSvc.dataPath, fs.constants.W_OK)
      .then(
        () => false,
        (err: NodeJS.ErrnoException) =>
          err.code === 'EROFS' || err.code === 'EACCES',
      ));
  }
}
