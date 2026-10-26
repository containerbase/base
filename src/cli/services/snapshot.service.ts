import type { Stats } from 'node:fs';
import fs from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { inject, injectable } from 'inversify';
import { hash } from '../utils/hash.ts';
import { isInside, logger, move } from '../utils/index.ts';
import { DataService } from './data.service.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';

/** The database file in the data folder. */
export const databaseFile = 'containerbase.db';

/**
 * The list of linked folders in the snapshot, one `<flag> <path>` line per
 * folder, see `writeIndex`.
 */
export const linksFile = '.links';

/**
 * The folders of tools writing into their install folder at runtime, see
 * `moveAndLink`.
 */
const copyFile = '.copy';

/** The stamp of the snapshot, see `writeIndex`. */
export const stampFile = '.stamp';

/** A folder below `/opt/containerbase/tools` linked to the snapshot. */
export interface SnapshotLink {
  /** The link below `/opt/containerbase/tools`. */
  path: string;
  /** The absolute link target in the snapshot. */
  target: string;
}

/**
 * Returns `fallback` for an `ENOENT` error, eg. a missing path, and rethrows
 * all other errors, eg. missing permissions.
 */
export function ifMissing<T>(fallback: T): (err: unknown) => T {
  return (err: unknown) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw err;
  };
}

/**
 * The stats of the path without following a link, `null` when it's missing.
 *
 * @throws when the path can't be read, eg. missing permissions
 */
export function lstat(path: string): Promise<Stats | null> {
  return fs.lstat(path).catch(ifMissing(null));
}

/**
 * A temp path next to `path`, which is renamed over `path` once written, so
 * an interrupted run never leaves a half written `path`.
 */
export function tmpPath(path: string): string {
  return `${path}.tmp`;
}

/**
 * The names of the folder's entries, none when it's missing.
 *
 * @throws when the folder can't be read, eg. missing permissions
 */
export function readdir(path: string): Promise<string[]> {
  return fs.readdir(path).catch(ifMissing<string[]>([]));
}

/**
 * The lines of a text file, none when it's missing.
 *
 * @throws when the file can't be read, eg. missing permissions
 */
async function readLines(path: string): Promise<string[]> {
  const content = await fs.readFile(path, 'utf8').catch(ifMissing(''));
  return content.split('\n').filter((line) => line !== '');
}

/**
 * Whether the copy `dst` of the file or link `src` is up to date: a link with
 * the same target, or a file with the same size and modification time.
 */
async function isSame(
  src: string,
  srcStats: Stats,
  dst: string,
  dstStats: Stats,
): Promise<boolean> {
  if (srcStats.isSymbolicLink()) {
    return (
      dstStats.isSymbolicLink() &&
      (await fs.readlink(src)) === (await fs.readlink(dst))
    );
  }
  return (
    dstStats.isFile() &&
    srcStats.size === dstStats.size &&
    Math.abs(srcStats.mtimeMs - dstStats.mtimeMs) < 1
  );
}

/**
 * Keeps a snapshot of what an image build installs to `/opt/containerbase` in
 * `/var/lib/containerbase/opt`, at the same relative paths, so a volume
 * mounted at `/opt/containerbase` can be filled from it. Installs keep writing
 * to `/opt/containerbase`, so the absolute paths they write stay valid.
 */
@injectable()
export class SnapshotService {
  @inject(PathService)
  private readonly pathSvc!: PathService;
  @inject(EnvService)
  private readonly envSvc!: EnvService;
  @inject(DataService)
  private readonly dataSvc!: DataService;

  /**
   * Moves the folder an install created into the snapshot and replaces it by
   * an absolute link to the moved folder, see `move`. An older copy in the
   * snapshot is replaced. A link, eg. from an earlier snapshot, is skipped.
   * A missing folder is skipped with a warning, as the installer then writes
   * somewhere else and has to override `BaseInstallService.snapshot`. When
   * the link can't be created, the folder is moved back, so the tool stays
   * usable. With `copy`, the folder belongs to a tool writing into its
   * install folder at runtime, which a restore copies onto a volume, see
   * `writeIndex`.
   *
   * @throws when the folder can't be moved or linked
   */
  async moveAndLink(path: string, copy = false): Promise<void> {
    const stats = await lstat(path);
    if (!stats) {
      logger.warn({ path }, 'snapshot: no folder to move');
      return;
    }
    if (!stats.isDirectory()) {
      logger.debug({ path }, 'snapshot: folder already linked');
      return;
    }
    const target = this.snapshotPath(path);
    if (copy) {
      const file = join(this.pathSvc.snapshotDir, copyFile);
      const paths = new Set(await readLines(file));
      paths.add(relative(this.pathSvc.installDir, path));
      await this.pathSvc.createDir(this.pathSvc.snapshotDir);
      await this.writeIfChanged(
        file,
        [...paths].map((rel) => `${rel}\n`).join(''),
      );
    }
    logger.debug({ path, target }, 'snapshot: moving folder');
    await fs.rm(target, { recursive: true, force: true });
    await this.pathSvc.createDir(dirname(target));
    await move(path, target);
    try {
      await fs.symlink(target, path);
    } catch (err) {
      await move(target, path).catch((moveErr: unknown) =>
        logger.warn(
          { err: moveErr, path, target },
          'snapshot: could not move the folder back',
        ),
      );
      throw err;
    }
  }

  /** Removes the copy of a path below `/opt/containerbase` from the snapshot. */
  async remove(path: string): Promise<void> {
    const target = this.snapshotPath(path);
    logger.debug({ path, target }, 'snapshot: removing');
    await fs.rm(target, { recursive: true, force: true });
  }

  /**
   * Makes `dst` a copy of `src`, eg. to copy a file or a version folder from
   * the snapshot onto a volume, see `sync`. As root, the copies are given to
   * the user and the root group.
   *
   * @throws when a copy can't be written
   */
  async copy(src: string, dst: string): Promise<void> {
    await this.sync(src, dst, true);
  }

  /**
   * Updates the copies of the files which installs and prepares change
   * outside of the version folders in the snapshot: the `bin`, `lib`, `env.d`,
   * `versions` and `ssl` folders, the `env.sh` of every tool and the database.
   * Only changed files are copied, so unchanged ones stay in their image
   * layer, copies of removed files are removed. Then updates the list of
   * linked folders and the stamp, see `writeIndex`.
   */
  async snapshotFiles(): Promise<void> {
    for (const path of this.filePaths) {
      await this.sync(path, this.snapshotPath(path));
    }
    await this.snapshotToolEnvs();
    await this.snapshotDatabase();
    await this.writeIndex();
  }

  /**
   * The folders below `/opt/containerbase/tools` linked to the snapshot, up
   * to `tools/<tool>/<version>/<parentVersion>`, with their link target.
   * Links into a linked folder aren't followed.
   */
  async findLinks(): Promise<SnapshotLink[]> {
    const { snapshotDir } = this.pathSvc;
    const links: SnapshotLink[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
      for (const entry of (await readdir(dir)).sort()) {
        const path = join(dir, entry);
        const stats = await lstat(path);
        if (stats?.isSymbolicLink()) {
          const target = await fs.readlink(path);
          if (isInside(snapshotDir, target)) {
            links.push({ path, target });
          }
        } else if (stats?.isDirectory() && depth < 3) {
          await walk(path, depth + 1);
        }
      }
    };
    await walk(this.pathSvc.toolsPath, 1);
    return links;
  }

  /**
   * Reads a stamp, see `writeIndex`, from `/opt/containerbase` or the
   * snapshot folder, `null` when it's missing.
   *
   * @throws when the stamp can't be read, eg. missing permissions
   */
  async readStamp(dir: string): Promise<string | null> {
    return await fs
      .readFile(join(dir, stampFile), 'utf8')
      .catch(ifMissing(null));
  }

  /**
   * The files below `/opt/containerbase` copied into the snapshot, besides
   * the `env.sh` of every tool and the database: the `bin`, `lib`, `env.d`,
   * `versions` and `ssl` folders.
   */
  get filePaths(): string[] {
    const { installDir } = this.pathSvc;
    return [
      this.pathSvc.binDir,
      join(installDir, 'lib'),
      join(installDir, 'env.d'),
      this.pathSvc.versionPath,
      this.pathSvc.sslPath,
    ];
  }

  /** Path of the copy of a path below `/opt/containerbase` in the snapshot. */
  snapshotPath(path: string): string {
    return join(
      this.pathSvc.snapshotDir,
      relative(this.pathSvc.installDir, path),
    );
  }

  /**
   * Writes the list of linked folders, see `findLinks`, to `.links` in the
   * snapshot, one `<flag> <path>` line per folder, the flag `c` for folders a
   * restore copies onto a volume, see `moveAndLink`, else `l`.
   * Then writes a stamp of the snapshot to `.stamp` in the snapshot and in
   * `/opt/containerbase`, so a restore can tell whether `/opt/containerbase`
   * matches the snapshot, see `RestoreService`. The stamp is a hash of the
   * list and of the copied files, see `fingerprint`. Files are only written
   * when they change.
   */
  private async writeIndex(): Promise<void> {
    const { installDir, snapshotDir } = this.pathSvc;
    const copies = new Set(await readLines(join(snapshotDir, copyFile)));
    const links = (await this.findLinks())
      .map(({ path }) => relative(installDir, path))
      .map((rel) => `${copies.has(rel) ? 'c' : 'l'} ${rel}\n`)
      .join('');
    await this.pathSvc.createDir(snapshotDir);
    await this.pathSvc.createDir(installDir);
    await this.writeIfChanged(join(snapshotDir, linksFile), links);
    const stamp = await this.fingerprint(links);
    await this.writeIfChanged(join(snapshotDir, stampFile), stamp);
    await this.writeIfChanged(join(installDir, stampFile), stamp);
  }

  /** Writes the file, owned by the user, unless it already has the content. */
  private async writeIfChanged(file: string, content: string): Promise<void> {
    const existing = await fs.readFile(file, 'utf8').catch(ifMissing(null));
    if (existing !== content) {
      await this.pathSvc.writeFile(file, content);
    }
  }

  /**
   * A hash of the list of linked folders and of the copies of the files in
   * the snapshot: their paths, link targets, and sizes, modification times,
   * modes and owners of files.
   */
  private async fingerprint(links: string): Promise<string> {
    const { snapshotDir } = this.pathSvc;
    const lines = [links];
    const add = async (path: string): Promise<void> => {
      const stats = await lstat(path);
      const rel = relative(snapshotDir, path);
      if (!stats) {
        return;
      }
      if (stats.isDirectory()) {
        lines.push(`d ${rel}`);
        for (const entry of (await readdir(path)).sort()) {
          await add(join(path, entry));
        }
      } else if (stats.isSymbolicLink()) {
        lines.push(`l ${rel} ${await fs.readlink(path)}`);
      } else {
        lines.push(
          `f ${rel} ${stats.size} ${Math.trunc(stats.mtimeMs)} ${stats.mode} ${stats.uid} ${stats.gid}`,
        );
      }
    };
    for (const path of this.filePaths) {
      await add(this.snapshotPath(path));
    }
    await add(this.snapshotPath(join(this.pathSvc.dataPath, databaseFile)));
    const tools = this.snapshotPath(this.pathSvc.toolsPath);
    for (const tool of (await readdir(tools)).sort()) {
      await add(join(tools, tool, 'env.sh'));
    }
    return hash(lines.join('\n'), 'sha256');
  }

  /**
   * Makes `dst` a copy of `src`, recursively for folders. Links are copied as
   * links, files only when they changed, see `isSame`. Entries missing in
   * `src` are removed from `dst`. Every copy gets the mode and owner of its
   * source, or with `toUser` the user, see `setOwner`.
   *
   * @throws when a copy can't be written
   */
  private async sync(src: string, dst: string, toUser = false): Promise<void> {
    const srcStats = await lstat(src);
    const dstStats = await lstat(dst);
    if (!srcStats) {
      if (dstStats) {
        await fs.rm(dst, { recursive: true, force: true });
      }
      return;
    }

    if (srcStats.isDirectory()) {
      let dirStats = dstStats;
      if (!dirStats?.isDirectory()) {
        await fs.rm(dst, { recursive: true, force: true });
        await fs.mkdir(dst, { recursive: true });
        dirStats = null;
      }
      await this.setOwner(dst, srcStats, toUser, dirStats);
      const entries = new Set(await readdir(src));
      for (const entry of entries) {
        await this.sync(join(src, entry), join(dst, entry), toUser);
      }
      for (const entry of await readdir(dst)) {
        if (!entries.has(entry)) {
          await fs.rm(join(dst, entry), { recursive: true, force: true });
        }
      }
      return;
    }

    if (dstStats && (await isSame(src, srcStats, dst, dstStats))) {
      await this.setOwner(dst, srcStats, toUser, dstStats);
      return;
    }
    if (dstStats) {
      await fs.rm(dst, { recursive: true, force: true });
    }
    if (srcStats.isSymbolicLink()) {
      await fs.symlink(await fs.readlink(src), dst);
    } else {
      await fs.copyFile(src, dst);
      await fs.utimes(dst, srcStats.atime, srcStats.mtime);
    }
    await this.setOwner(dst, srcStats, toUser);
  }

  /**
   * Gives the copy the mode of its source and, as root, the owner and group
   * of its source, or with `toUser` the user and the root group, so a folder
   * filled from the snapshot stays writable for the user. Only changed values
   * are set, the mode of a link is never changed. `current` are the stats of
   * the copy when already known.
   */
  private async setOwner(
    path: string,
    src: Stats,
    toUser = false,
    current: Stats | null = null,
  ): Promise<void> {
    const stats = current ?? (await fs.lstat(path));
    const uid = toUser ? this.envSvc.userId : src.uid;
    const gid = toUser ? 0 : src.gid;
    if (this.envSvc.isRoot && (stats.uid !== uid || stats.gid !== gid)) {
      await fs.lchown(path, uid, gid);
    }
    const mode = src.mode & 0o7777;
    if (!src.isSymbolicLink() && (stats.mode & 0o7777) !== mode) {
      await fs.chmod(path, mode);
    }
  }

  /**
   * Updates the copies of the `env.sh` of every tool, also removing copies of
   * removed ones. A tool path which is no folder is skipped, eg. `dotnet`
   * linked to the snapshot, whose `env.sh` is already there.
   */
  private async snapshotToolEnvs(): Promise<void> {
    const { toolsPath } = this.pathSvc;
    const tools = new Set([
      ...(await readdir(toolsPath)),
      ...(await readdir(this.snapshotPath(toolsPath))),
    ]);
    for (const tool of tools) {
      const toolPath = join(toolsPath, tool);
      const toolStats = await lstat(toolPath);
      // a removed tool also removes the copy of its `env.sh`
      if (toolStats && !toolStats.isDirectory()) {
        continue;
      }
      const file = join(toolPath, 'env.sh');
      const target = this.snapshotPath(file);
      if (await lstat(file)) {
        await this.pathSvc.createDir(dirname(target));
      }
      await this.sync(file, target);
    }
  }

  /**
   * Writes a consistent copy of the database into the snapshot with
   * `VACUUM INTO`, replacing an older copy, with the owner and mode of the
   * database. The copy has no journal, so it can be opened read-only. It gets
   * the modification time of the database, so an unchanged database isn't
   * copied again. Skipped without a database.
   */
  private async snapshotDatabase(): Promise<void> {
    const file = join(this.pathSvc.dataPath, databaseFile);
    const stats = await lstat(file);
    if (!stats) {
      logger.debug({ file }, 'snapshot: no database');
      return;
    }
    const target = this.snapshotPath(file);
    const copy = await lstat(target);
    if (copy && Math.abs(copy.mtimeMs - stats.mtimeMs) < 1) {
      logger.debug({ file }, 'snapshot: database unchanged');
      return;
    }
    logger.debug({ file, target }, 'snapshot: copying database');
    await fs.rm(target, { force: true });
    await fs.rm(`${target}-journal`, { force: true });
    await this.pathSvc.createDir(dirname(target));
    const db = await this.dataSvc.db();
    db.prepare('VACUUM INTO ?').run(target);
    await fs.utimes(target, stats.atime, stats.mtime);
    await this.setOwner(target, stats);
  }
}
