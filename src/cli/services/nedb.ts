import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { tools } from '../../../packages/base/src/data.ts';
import { packageKey } from '../tools/index.ts';
import type { InstallToolType } from '../utils';
import { isMissing, isNotFound, logger, tool2path } from '../utils/index.ts';
import { parentColumns } from './parent.ts';
import type { PathService } from './path.service.ts';
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

/** The install types whose packages are recorded with the type, see `packageKey`. */
const packageTypes = new Set<string>(['gem', 'npm', 'pip']);

/** The columns of the former nedb stores which hold a tool name. */
const toolColumns: Record<string, number[]> = {
  links: [1],
  state: [0, 1],
  types: [0],
  versions: [0],
};

/**
 * Renames the packages older versions installed with `install-gem`,
 * `install-npm` or `install-pip` in the documents of the former nedb
 * databases from `<name>` to `<type>+<name>`, see `packageKey`. Every name
 * `install-tool` supports keeps its name, `install-tool` installs it by it:
 * the tools of the `ResolverMap` and every tool with an own install service,
 * like `yarn` or `renovate`, which older versions installed for a package of
 * the same name.
 * @returns the renamed packages, old name to new name
 */
export function prefixPackages(stores: NedbStore[]): Map<string, string> {
  const renames = new Map<string, string>();
  for (const [name, type] of stores.find((s) => s.name === 'types')?.rows ??
    []) {
    if (
      typeof name === 'string' &&
      typeof type === 'string' &&
      packageTypes.has(type) &&
      !Object.hasOwn(tools, name)
    ) {
      renames.set(name, packageKey(type as InstallToolType, name));
    }
  }
  for (const { name, rows } of stores) {
    for (const row of rows) {
      for (const column of toolColumns[name] ?? []) {
        const value = row[column];
        const to = typeof value === 'string' && renames.get(value);
        if (to) {
          row[column] = to;
        }
      }
    }
  }
  return renames;
}

/**
 * Links the new tool folder of every package `prefixPackages` renamed to its
 * old one, `tools/<type>+<name>` to `<name>`. The real folder stays, as the
 * installs hold absolute paths into it, like npm's `bin` link or the
 * shebangs of a pip virtualenv, and so do the shell wrappers, which keep
 * working unchanged. Packages without a folder are skipped. The file of the
 * current version is renamed, nothing points at it. A link an interrupted
 * earlier migration already created is kept.
 *
 * @throws when a link can't be created, eg. another file has its name, or a
 * file can't be renamed
 */
export async function linkPackageFolders(
  pathSvc: PathService,
  renames: Map<string, string>,
): Promise<void> {
  for (const [from, to] of renames) {
    const folder = tool2path(from);
    await fs
      .rename(
        join(pathSvc.versionPath, folder),
        join(pathSvc.versionPath, tool2path(to)),
      )
      .catch((err: unknown) => {
        if (!isNotFound(err)) {
          throw err;
        }
      });
    if (await isMissing(join(pathSvc.toolsPath, folder))) {
      continue;
    }
    const link = join(pathSvc.toolsPath, tool2path(to));
    try {
      await fs.symlink(folder, link);
    } catch (err) {
      if (
        (err as NodeJS.ErrnoException).code !== 'EEXIST' ||
        (await fs.readlink(link).catch(() => null)) !== folder
      ) {
        throw err;
      }
    }
  }
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
