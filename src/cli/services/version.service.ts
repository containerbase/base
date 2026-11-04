import { chmod, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { inject, injectable, postConstruct } from 'inversify';
import type { InstallToolType } from '../utils';
import { fileRights, logger, tool2path } from '../utils/index.ts';
import { DataService } from './data.service.ts';
import { parentColumns, parentParams, toParent } from './parent.ts';
import { PathService } from './path.service.ts';
import type {
  InstalledTool,
  InstalledToolVersion,
  Tool,
} from './version.schema.ts';

/** A row of the `versions` table, `''` means no parent. */
interface VersionRow extends Record<string, SQLOutputValue> {
  name: string;
  version: string;
  parent_name: string;
  parent_version: string;
}

/** A row of the `links` table. */
interface LinkRow extends Record<string, SQLOutputValue> {
  name: string;
  tool_name: string;
  tool_version: string;
}

/** A row of the `state` table, `''` means no parent. */
interface StateRow extends LinkRow {
  parent_name: string;
  parent_version: string;
}

/** A row of the `types` table. */
interface TypeRow extends Record<string, SQLOutputValue> {
  name: string;
  type: InstallToolType;
}

/**
 * Matches the parent only when `:parent_name` is set, otherwise any parent.
 */
const parentFilter =
  '(:parent_name IS NULL OR (parent_name = :parent_name AND parent_version = :parent_version))';

const selectState =
  'SELECT name, tool_name, tool_version, parent_name, parent_version FROM state';

/** Matches the versions by the given fields only. */
const versionFilter = `(:name IS NULL OR name = :name) AND (:version IS NULL OR version = :version) AND ${parentFilter}`;

/** Converts a `versions` row. */
function toToolVersion(row: VersionRow): ToolVersion {
  return {
    name: row.name,
    version: row.version,
    ...toParent(row.parent_name, row.parent_version),
  };
}

/** Converts a `links` row. */
function toToolLink(row: LinkRow): ToolLink {
  return {
    name: row.name,
    tool: { name: row.tool_name, version: row.tool_version },
  };
}

/** Converts a `state` row. */
function toToolState(row: StateRow): ToolState {
  return {
    ...toToolLink(row),
    ...toParent(row.parent_name, row.parent_version),
  };
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

/**
 * Keeps track of the installed tools in four tables:
 *
 * - versions: every installed version, a tool can have many, each optionally
 *   installed for a parent tool version, eg. a npm package for a node version
 * - state: the current version per tool, the one on the path
 * - links: the shell wrapper names created for a tool version
 * - types: the installer of dynamically installed tools, eg. `npm`
 */
@injectable()
export class VersionService {
  @inject(DataService)
  private readonly dataSvc!: DataService;

  @inject(PathService)
  private readonly pathSvc!: PathService;

  private _db!: DatabaseSync;

  /**
   * Whether exactly this version is recorded, including its parent when given.
   * Without a parent any parent matches.
   */
  isInstalled(tool: ToolVersion): Promise<boolean> {
    return Promise.try(
      () =>
        this._db
          .prepare(`SELECT 1 FROM versions WHERE ${versionFilter} LIMIT 1`)
          .get({
            name: tool.name,
            version: tool.version,
            ...parentParams(tool.parent),
          }) !== undefined,
    );
  }

  /** All recorded versions of a tool, for any parent. */
  findInstalled(name: string): Promise<ToolVersion[]> {
    return Promise.try(() =>
      this._versions('WHERE name = ?', name).map(toToolVersion),
    );
  }

  /**
   * Lists all installed tools with their versions, sorted by tool name.
   *
   * The current version is looked up by `tool.name`, because tools are linked
   * under their alias, eg. `java-jdk` is linked as `java`.
   */
  listInstalled(): Promise<InstalledTool[]> {
    return Promise.try(() => this._listInstalled());
  }

  /** Records an installed version. */
  addInstalled(tool: ToolVersion): Promise<void> {
    return Promise.try(() => {
      this._db
        .prepare(
          'INSERT INTO versions (name, version, parent_name, parent_version) VALUES (?, ?, ?, ?)',
        )
        .run(tool.name, tool.version, ...parentColumns(tool.parent));
    });
  }

  /** Removes every recorded version matching the given fields. */
  removeInstalled(tool: Partial<ToolVersion>): Promise<void> {
    return Promise.try(() => {
      this._db.prepare(`DELETE FROM versions WHERE ${versionFilter}`).run({
        name: tool.name ?? null,
        version: tool.version ?? null,
        ...parentParams(tool.parent),
      });
    });
  }

  /**
   * The versions installed for exactly this parent version. Children of other
   * versions of the same parent tool are not included.
   */
  getChilds(parent: Tool): Promise<ToolVersion[]> {
    return Promise.try(() =>
      this._versions(
        'WHERE parent_name = ? AND parent_version = ?',
        parent.name,
        parent.version,
      ).map(toToolVersion),
    );
  }

  /** Whether the shell wrapper name points at exactly this tool version. */
  isLinked(link: ToolLink): Promise<boolean> {
    return Promise.try(
      () =>
        this._db
          .prepare(
            'SELECT 1 FROM links WHERE name = ? AND tool_name = ? AND tool_version = ?',
          )
          .get(link.name, link.tool.name, link.tool.version) !== undefined,
    );
  }

  /** The shell wrapper names created for a tool version. */
  findLinks(tool: Tool): Promise<ToolLink[]> {
    return Promise.try(() =>
      (
        this._db
          .prepare(
            'SELECT name, tool_name, tool_version FROM links WHERE tool_name = ? AND tool_version = ? ORDER BY rowid',
          )
          .all(tool.name, tool.version) as LinkRow[]
      ).map(toToolLink),
    );
  }

  /**
   * Points a shell wrapper name at a tool version, replacing whatever it
   * pointed at before.
   */
  setLink(link: ToolLink): Promise<void> {
    return Promise.try(() => {
      this._db
        .prepare(
          'INSERT INTO links (name, tool_name, tool_version) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET tool_name = excluded.tool_name, tool_version = excluded.tool_version',
        )
        .run(link.name, link.tool.name, link.tool.version);
    });
  }

  /** Forgets every shell wrapper name created for a tool version. */
  removeLinks(tool: Tool): Promise<void> {
    return Promise.try(() => {
      this._db
        .prepare('DELETE FROM links WHERE tool_name = ? AND tool_version = ?')
        .run(tool.name, tool.version);
    });
  }

  /**
   * Whether exactly this version, and parent when given, is the current one.
   * Without a parent any parent matches.
   */
  isCurrent(state: ToolState): Promise<boolean> {
    return Promise.try(
      () =>
        this._db
          .prepare(
            `SELECT 1 FROM state WHERE name = :name AND tool_name = :tool_name AND tool_version = :tool_version AND ${parentFilter}`,
          )
          .get({
            name: state.name,
            tool_name: state.tool.name,
            tool_version: state.tool.version,
            ...parentParams(state.parent),
          }) !== undefined,
    );
  }

  /** Makes a version the current one, replacing the previous current one. */
  setCurrent(state: ToolState): Promise<void> {
    return Promise.try(() => {
      this._db
        .prepare(
          'INSERT INTO state (name, tool_name, tool_version, parent_name, parent_version) VALUES (?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET tool_name = excluded.tool_name, tool_version = excluded.tool_version, parent_name = excluded.parent_name, parent_version = excluded.parent_version',
        )
        .run(
          state.name,
          state.tool.name,
          state.tool.version,
          ...parentColumns(state.parent),
        );
    });
  }

  /**
   * The current version, looked up by the name the tool is linked as, which
   * is its alias, eg. `java` for `java-jdk`.
   */
  getCurrent(name: string): Promise<ToolState | null> {
    return Promise.try(() => {
      const row = this._db
        .prepare(`${selectState} WHERE name = ?`)
        .get(name) as StateRow | undefined;
      return row ? toToolState(row) : null;
    });
  }

  /** Forgets the current version and removes its legacy version file. */
  async removeCurrent(name: string): Promise<void> {
    this._db.prepare('DELETE FROM state WHERE name = ?').run(name);
    const path = join(this.pathSvc.versionPath, tool2path(name));
    try {
      await rm(path);
    } catch (err) {
      logger.error({ tool: name, err }, 'tool version file not found');
    }
  }

  /** The installer a dynamically installed tool was installed with. */
  getType(name: string): Promise<InstallToolType | undefined> {
    return Promise.try(
      () =>
        (
          this._db
            .prepare('SELECT name, type FROM types WHERE name = ?')
            .get(name) as TypeRow | undefined
        )?.type,
    );
  }

  /** Every dynamically installed tool with its installer. */
  getTypes(): Promise<ToolType[]> {
    return Promise.try(() => this._types());
  }

  /**
   * Records the installer of a dynamically installed tool. Without one the
   * tool is forgotten, so it has no installer.
   */
  setType(name: string, type: InstallToolType | undefined): Promise<void> {
    return Promise.try(() => {
      if (type) {
        this._db
          .prepare(
            'INSERT INTO types (name, type) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET type = excluded.type',
          )
          .run(name, type);
      } else {
        this._db.prepare('DELETE FROM types WHERE name = ?').run(name);
      }
    });
  }

  /** The `versions` rows matching the `WHERE` clause, in insertion order. */
  private _versions(where: string, ...params: string[]): VersionRow[] {
    return this._db
      .prepare(
        `SELECT name, version, parent_name, parent_version FROM versions ${where} ORDER BY rowid`,
      )
      .all(...params) as VersionRow[];
  }

  /** Every `types` row, in insertion order. */
  private _types(): ToolType[] {
    return (
      this._db
        .prepare('SELECT name, type FROM types ORDER BY rowid')
        .all() as TypeRow[]
    ).map(({ name, type }) => ({ name, type }));
  }

  /** Builds the result of `listInstalled`. */
  private _listInstalled(): InstalledTool[] {
    const versions = this._versions('').map(toToolVersion);
    const states = (this._db.prepare(selectState).all() as StateRow[]).map(
      toToolState,
    );
    const types = this._types();

    const tools = new Map<string, InstalledToolVersion[]>();
    for (const { name, version, parent } of versions) {
      let installed = tools.get(name);
      if (!installed) {
        tools.set(name, (installed = []));
      }
      installed.push(parent ? { version, parent } : { version });
    }

    return Array.from(tools.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([name, versions]) => {
        const type = types.find((t) => t.name === name)?.type;
        return {
          name,
          version:
            states.find((s) => s.tool.name === name)?.tool.version ?? null,
          versions: versions.sort((a, b) =>
            a.version.localeCompare(b.version, undefined, { numeric: true }),
          ),
          ...(type ? { type } : {}),
        };
      });
  }

  /**
   * Required for v2 tool to find parent tool version.
   * The version file is only written when its content changes.
   * @param tool
   * @param version
   * @deprecated legacy v2 tools compability
   */
  async update(tool: string, version: string): Promise<void> {
    const path = join(this.pathSvc.versionPath, tool2path(tool));
    try {
      const current = await readFile(path, { encoding: 'utf8' }).catch(
        () => null,
      );
      if (current === version) {
        return;
      }
      await writeFile(path, version, { encoding: 'utf8' });
      const s = await stat(path);
      if ((s.mode & fileRights) !== 0o664) {
        await chmod(path, 0o664);
      }
    } catch (err) {
      logger.error({ tool, err }, 'tool version not found');
    }
  }

  /** Opens the database. */
  @postConstruct()
  protected async [Symbol('construct')](): Promise<void> {
    this._db = await this.dataSvc.db();
  }
}
