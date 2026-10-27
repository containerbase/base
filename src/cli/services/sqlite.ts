import { DatabaseSync } from 'node:sqlite';
import { logger } from '../utils/index.ts';

/** The columns of the tables, besides `name`. */
export const columns: Record<string, string[]> = {
  versions: ['version', 'parent_name', 'parent_version'],
  links: ['tool_name', 'tool_version'],
  state: ['tool_name', 'tool_version', 'parent_name', 'parent_version'],
  types: ['type'],
};

/**
 * The key of a row in `tombstones`: the columns of the table besides `name`,
 * read from the row alias, eg. `b`, as a json array.
 */
export function rowKey(table: string, alias: string): string {
  return `json_array(${columns[table]!.map((c) => `${alias}.${c}`).join(', ')})`;
}

/** Joins the rows `m` and `b` of a table on all their columns. */
export function sameRow(table: string): string {
  return ['name', ...columns[table]!]
    .map((c) => `m.${c} = b.${c}`)
    .join(' AND ');
}

/** Waits up to 5 seconds for a lock held by another process. */
export const busyTimeout = 'PRAGMA busy_timeout = 5000;';

/**
 * The schema version of the database, or of an attached one by its schema
 * name, `0` before the schema is created.
 */
export function userVersion(db: DatabaseSync, schema = 'main'): number {
  return Number(
    db.prepare(`PRAGMA ${schema}.user_version`).get()?.user_version,
  );
}

/** Whether the schema, eg. `main`, of the database has the table. */
export function hasTable(
  db: DatabaseSync,
  schema: string,
  table: string,
): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM ${schema}.sqlite_master WHERE type = 'table' AND name = ?`,
      )
      .get(table) !== undefined
  );
}

/**
 * Opens an existing database writable just for a read, so SQLite rolls back
 * a journal left by an interrupted writer, which a read-only connection can't
 * do. Nothing else is changed. A failure, eg. missing permissions or a lock
 * held by a running writer, is only logged, the read-only open follows anyway.
 */
export function rollbackJournal(file: string): void {
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
