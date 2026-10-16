import fs from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bindingScopeValues, inject, injectable } from 'inversify';
import { isMissing, logger } from '../utils/index.ts';
import { hasNedb, insertStores, readNedbStores } from './nedb.ts';
import { PathService } from './path.service.ts';

/** The schema version the `schema` creates, stored in `user_version`. */
const schemaVersion = 1;

/**
 * The database schema, a missing parent is stored as `''`, so the unique
 * constraint also applies to versions without a parent.
 */
const schema = `
CREATE TABLE IF NOT EXISTS versions (
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  parent_name TEXT NOT NULL DEFAULT '',
  parent_version TEXT NOT NULL DEFAULT '',
  UNIQUE (name, version, parent_name, parent_version)
);
CREATE INDEX IF NOT EXISTS versions_name ON versions (name);
CREATE INDEX IF NOT EXISTS versions_parent ON versions (parent_name, parent_version);

CREATE TABLE IF NOT EXISTS links (
  name TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  tool_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS links_tool ON links (tool_name, tool_version);

CREATE TABLE IF NOT EXISTS state (
  name TEXT PRIMARY KEY,
  tool_name TEXT NOT NULL,
  tool_version TEXT NOT NULL,
  parent_name TEXT NOT NULL DEFAULT '',
  parent_version TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS types (
  name TEXT PRIMARY KEY,
  type TEXT NOT NULL
);

PRAGMA user_version = ${schemaVersion};
`;

/** Waits up to 5 seconds for a lock held by another process. */
const busyTimeout = 'PRAGMA busy_timeout = 5000;';

/** The schema version of the database, `0` before the schema is created. */
function userVersion(db: DatabaseSync): number {
  return Number(db.prepare('PRAGMA user_version').get()?.user_version);
}

/**
 * Closes the database and throws when it was created by a newer containerbase
 * version, whose schema this version doesn't know.
 *
 * @param version - the schema version when the caller has already read it
 * @throws when the schema version is newer than `schemaVersion`
 */
function checkSchemaVersion(db: DatabaseSync, version = userVersion(db)): void {
  if (version > schemaVersion) {
    db.close();
    throw new Error(
      `The containerbase database was created by a newer containerbase version (schema ${version}), update containerbase.`,
    );
  }
}

/**
 * Opens an existing database read-only, waiting for a writer. Returns `null`
 * when the file doesn't exist or its schema isn't created yet, because
 * another process is just creating it.
 *
 * @throws when the database can't be checked or read, eg. missing
 * permissions, or was created by a newer containerbase version
 */
async function openExisting(file: string): Promise<DatabaseSync | null> {
  if (await isMissing(file)) {
    return null;
  }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    // wait for a writer instead of failing with `database is locked`
    db.exec(busyTimeout);
    const version = userVersion(db);
    if (version !== 0) {
      checkSchemaVersion(db, version);
      return db;
    }
  } catch (err) {
    // `checkSchemaVersion` closes it already
    if (db.isOpen) {
      db.close();
    }
    throw err;
  }
  logger.debug({ file }, 'database has no schema yet');
  db.close();
  return null;
}

/**
 * Opens an existing database writable just for a read, so SQLite rolls back
 * a journal left by an interrupted writer, which a read-only connection can't
 * do. Nothing else is changed. A failure, eg. missing permissions or a lock
 * held by a running writer, is only logged, the read-only open follows anyway.
 */
function rollbackJournal(file: string): void {
  try {
    const db = new DatabaseSync(file);
    try {
      db.exec(busyTimeout);
      userVersion(db);
    } finally {
      db.close();
    }
  } catch (err) {
    logger.debug({ file, err }, 'could not roll back the database journal');
  }
}

@injectable(bindingScopeValues.Singleton)
export class DataService {
  private _db: Promise<DatabaseSync> | undefined;
  private _readOnly: Promise<boolean> | undefined;
  private _forceReadOnly = false;

  @inject(PathService)
  private readonly pathSvc!: PathService;

  /** Returns the database, opening it on first use. */
  db(): Promise<DatabaseSync> {
    return (this._db ??= this._open());
  }

  /**
   * Opens the database read-only, even when the data folder is writable.
   * Commands that only read call it before the first database access, it has
   * no effect on an already opened database.
   */
  readOnly(): void {
    this._forceReadOnly = true;
  }

  /**
   * Opens the database, read-only when the data folder is not writable or
   * `readOnly` was called. A writable database is created with its schema
   * when missing, migrating the databases of older containerbase versions.
   * The migration also runs before a forced read-only open when the folder
   * is writable, like the rollback of a journal left by an interrupted
   * writer.
   *
   * @throws when the database was created by a newer containerbase version
   */
  private async _open(): Promise<DatabaseSync> {
    const file = join(this.pathSvc.dataPath, 'containerbase.db');
    const notWritable = await this._isReadOnly();

    if (notWritable || this._forceReadOnly) {
      if (!notWritable) {
        await this._prepareReadOnly(file);
      }
      return await this._openReadOnly(file);
    }

    return await this._openWritable(file);
  }

  /**
   * Prepares a forced read-only open on a writable data folder: migrates the
   * databases of an older version when the database is missing, otherwise
   * rolls back a journal left by an interrupted writer.
   *
   * @throws when the migration fails
   */
  private async _prepareReadOnly(file: string): Promise<void> {
    if (await isMissing(file)) {
      if (await hasNedb(this.pathSvc.dataPath)) {
        (await this._openWritable(file)).close();
      }
    } else if (!(await isMissing(`${file}-journal`))) {
      rollbackJournal(file);
    }
  }

  /**
   * Opens the database writable, creating and migrating it when missing. A
   * database of a newer schema is left unchanged. The file gets its owner and
   * mode before the migration, so a failed migration doesn't leave a file
   * other users can't write. The database is closed on any error.
   *
   * @throws when the database was created by a newer containerbase version,
   * its owner can't be set or the migration fails
   */
  private async _openWritable(file: string): Promise<DatabaseSync> {
    await this.pathSvc.createDir(this.pathSvc.dataPath);
    const db = new DatabaseSync(file);
    try {
      db.exec(busyTimeout);
      // don't change a database of a newer schema, not even its journal mode
      checkSchemaVersion(db);
      // never use WAL, it can't be opened read-only
      db.exec('PRAGMA journal_mode = DELETE;');
      await this.pathSvc.setOwner({ path: file, mode: 0o664 });
      if (userVersion(db) === 0) {
        await this._migrate(db);
      }
      checkSchemaVersion(db);
      return db;
    } catch (err) {
      // `checkSchemaVersion` closes it already
      if (db.isOpen) {
        db.close();
      }
      throw err;
    }
  }

  /**
   * Opens an existing database read-only. Without one an in-memory database
   * is used, filled from the databases of an older containerbase version when
   * they exist, so an older image still works on a read-only file system.
   * Without any database nothing is found. A database whose schema isn't
   * created yet, because another process is just creating it, counts as
   * missing. When another process finishes the migration while the old
   * databases are read, its database is used instead of the partly read
   * ones.
   *
   * @throws when a database can't be checked or read, eg. missing
   * permissions, or was created by a newer containerbase version
   */
  private async _openReadOnly(file: string): Promise<DatabaseSync> {
    logger.debug({ file }, 'opening database read-only');
    const existing = await openExisting(file);
    if (existing) {
      return existing;
    }

    const stores = await readNedbStores(this.pathSvc.dataPath);
    // a migration finishing meanwhile deleted the files not read yet
    const migrated = await openExisting(file);
    if (migrated) {
      logger.debug({ file }, 'database was migrated meanwhile');
      return migrated;
    }

    const db = new DatabaseSync(':memory:');
    db.exec(schema);
    if (stores.length) {
      logger.debug('loading the databases of an older version into memory');
      insertStores(db, stores);
    }
    return db;
  }

  /**
   * Creates the schema and moves the documents of the former nedb databases
   * into it in one transaction, then deletes the nedb files. A file with
   * skipped malformed documents is kept, so they can still be recovered. Does
   * nothing when another process migrated the database while the files were
   * read.
   */
  private async _migrate(db: DatabaseSync): Promise<void> {
    const stores = await readNedbStores(this.pathSvc.dataPath);

    db.exec('BEGIN IMMEDIATE');
    try {
      // the write lock is held now, so the version can't change anymore
      if (userVersion(db) !== 0) {
        db.exec('ROLLBACK');
        return;
      }
      db.exec(schema);
      insertStores(db, stores);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    for (const { name, file, rows, skipped } of stores) {
      logger.info(
        { store: name, count: rows.length },
        'migrated nedb database',
      );
      if (skipped) {
        logger.warn(
          { store: name, file, skipped },
          'kept nedb database with skipped documents',
        );
      } else {
        await fs.rm(file, { force: true });
      }
    }
  }

  /**
   * Whether the data folder is not writable, eg. on a read-only file system.
   * Other errors, like a missing folder, count as writable, so the folder and
   * the database are created. Checked once.
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
