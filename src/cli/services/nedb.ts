import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { isMissing, isNotFound, logger } from '../utils/index.ts';
import { parentColumns } from './parent.ts';
import { Tool } from './version.schema.ts';

/**
 * The former nedb stores, with the statement inserting a document into the
 * new table and the schema converting a document into the statement values.
 */
export const nedbStores = {
  links: {
    sql: 'INSERT OR REPLACE INTO links (name, tool_name, tool_version) VALUES (?, ?, ?)',
    row: z
      .object({ name: z.string(), tool: Tool })
      .transform(({ name, tool }) => [name, tool.name, tool.version]),
  },
  state: {
    sql: 'INSERT OR REPLACE INTO state (name, tool_name, tool_version, parent_name, parent_version) VALUES (?, ?, ?, ?, ?)',
    row: z
      .object({ name: z.string(), tool: Tool, parent: Tool.optional() })
      .transform(({ name, tool, parent }) => [
        name,
        tool.name,
        tool.version,
        ...parentColumns(parent),
      ]),
  },
  types: {
    sql: 'INSERT OR REPLACE INTO types (name, type) VALUES (?, ?)',
    row: z
      .object({ name: z.string(), type: z.string() })
      .transform(({ name, type }) => [name, type]),
  },
  versions: {
    sql: 'INSERT OR REPLACE INTO versions (name, version, parent_name, parent_version) VALUES (?, ?, ?, ?)',
    row: z
      .object({
        name: z.string(),
        version: z.string(),
        parent: Tool.optional(),
      })
      .transform(({ name, version, parent }) => [
        name,
        version,
        ...parentColumns(parent),
      ]),
  },
} satisfies Record<string, { sql: string; row: z.ZodType<SQLInputValue[]> }>;

/** A line of a nedb file, index metadata lines have no `_id`. */
const NedbLine = z.looseObject({
  _id: z.string().optional(),
  $$deleted: z.boolean().optional(),
});
type NedbLine = z.infer<typeof NedbLine>;

/** The documents of a nedb file, converted into the values to insert. */
export interface NedbRows {
  rows: SQLInputValue[][];
  /** The number of skipped malformed lines and documents. */
  skipped: number;
}

/** The documents of a nedb store with the statement inserting them. */
export interface NedbStore extends NedbRows {
  name: string;
  file: string;
  sql: string;
}

/** Parses a line of a nedb file, `null` when it is malformed. */
function parseNedbLine(line: string): NedbLine | null {
  try {
    return NedbLine.parse(JSON.parse(line));
  } catch {
    return null;
  }
}

/**
 * Reads the documents of a nedb file, or `null` when the file does not exist.
 * A later line with the same `_id` replaces the document, a `$$deleted` line
 * removes it. Malformed lines and documents are skipped and counted.
 *
 * @throws when the file exists but can't be read, so its documents aren't
 * silently lost by the migration
 */
export async function readNedb(
  file: string,
  row: z.ZodType<SQLInputValue[]>,
): Promise<NedbRows | null> {
  let content: string;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) {
      return null;
    }
    throw err;
  }

  let skipped = 0;
  const docs = new Map<string, NedbLine>();
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const doc = parseNedbLine(line);
    if (doc && ('$$indexCreated' in doc || '$$indexRemoved' in doc)) {
      continue;
    }
    if (!doc?._id) {
      logger.warn({ file, line }, 'skipping malformed database line');
      skipped++;
      continue;
    }
    if (doc.$$deleted) {
      docs.delete(doc._id);
    } else {
      docs.set(doc._id, doc);
    }
  }

  const rows: SQLInputValue[][] = [];
  for (const doc of docs.values()) {
    const res = row.safeParse(doc);
    if (res.success) {
      rows.push(res.data);
    } else {
      logger.warn({ file, doc }, 'skipping malformed database document');
      skipped++;
    }
  }
  return { rows, skipped };
}

/** The path of a former nedb database file in the data folder. */
function nedbFile(dataPath: string, name: string): string {
  return join(dataPath, `${name}.nedb`);
}

/**
 * Whether any database of an older containerbase version exists in the data
 * folder.
 *
 * @throws when a database file can't be checked, eg. missing permissions
 */
export async function hasNedb(dataPath: string): Promise<boolean> {
  for (const name of Object.keys(nedbStores)) {
    if (!(await isMissing(nedbFile(dataPath, name)))) {
      return true;
    }
  }
  return false;
}

/** Reads the documents of all existing former nedb databases. */
export async function readNedbStores(dataPath: string): Promise<NedbStore[]> {
  const stores: NedbStore[] = [];
  for (const [name, { sql, row }] of Object.entries(nedbStores)) {
    const file = nedbFile(dataPath, name);
    const docs = await readNedb(file, row);
    if (docs) {
      stores.push({ name, file, sql, ...docs });
    }
  }
  return stores;
}

/** Inserts the documents of the former nedb databases into their tables. */
export function insertStores(db: DatabaseSync, stores: NedbStore[]): void {
  for (const { sql, rows } of stores) {
    const insert = db.prepare(sql);
    for (const values of rows) {
      insert.run(...values);
    }
  }
}
