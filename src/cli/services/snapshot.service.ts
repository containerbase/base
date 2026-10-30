import type { Stats } from 'node:fs';
import fs from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { inject, injectable } from 'inversify';
import { logger, move } from '../utils/index.ts';
import { DataService } from './data.service.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';

/**
 * Returns `fallback` for an `ENOENT` error, eg. a missing path, and rethrows
 * all other errors, eg. missing permissions.
 */
function ifMissing<T>(fallback: T): (err: unknown) => T {
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
function lstat(path: string): Promise<Stats | null> {
  return fs.lstat(path).catch(ifMissing(null));
}

/**
 * The names of the folder's entries, none when it's missing.
 *
 * @throws when the folder can't be read, eg. missing permissions
 */
function readdir(path: string): Promise<string[]> {
  return fs.readdir(path).catch(ifMissing<string[]>([]));
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
   * usable.
   *
   * @throws when the folder can't be moved or linked
   */
  async moveAndLink(path: string): Promise<void> {
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
   * Updates the copies of the files which installs and prepares change
   * outside of the version folders in the snapshot: the `bin`, `lib`, `env.d`,
   * `versions` and `ssl` folders, the `env.sh` of every tool and the database.
   * Only changed files are copied, so unchanged ones stay in their image
   * layer, copies of removed files are removed.
   */
  async snapshotFiles(): Promise<void> {
    const { installDir } = this.pathSvc;
    for (const path of [
      this.pathSvc.binDir,
      join(installDir, 'lib'),
      join(installDir, 'env.d'),
      this.pathSvc.versionPath,
      this.pathSvc.sslPath,
    ]) {
      await this.sync(path, this.snapshotPath(path));
    }
    await this.snapshotToolEnvs();
    await this.snapshotDatabase();
  }

  /** Path of the copy of a path below `/opt/containerbase` in the snapshot. */
  private snapshotPath(path: string): string {
    return join(
      this.pathSvc.snapshotDir,
      relative(this.pathSvc.installDir, path),
    );
  }

  /**
   * Makes `dst` a copy of `src`, recursively for folders. Links are copied as
   * links, files only when they changed, see `isSame`. Entries missing in
   * `src` are removed from `dst`. Every copy gets the owner and mode of its
   * source, see `setOwner`.
   *
   * @throws when a copy can't be written
   */
  private async sync(src: string, dst: string): Promise<void> {
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
      await this.setOwner(dst, srcStats, dirStats);
      const entries = new Set(await readdir(src));
      for (const entry of entries) {
        await this.sync(join(src, entry), join(dst, entry));
      }
      for (const entry of await readdir(dst)) {
        if (!entries.has(entry)) {
          await fs.rm(join(dst, entry), { recursive: true, force: true });
        }
      }
      return;
    }

    if (dstStats && (await isSame(src, srcStats, dst, dstStats))) {
      await this.setOwner(dst, srcStats, dstStats);
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
    await this.setOwner(dst, srcStats);
  }

  /**
   * Gives the copy the mode of its source and, as root, its owner and group,
   * so a folder filled from the snapshot stays writable for the user. Only
   * changed values are set, the mode of a link is never changed. `current`
   * are the stats of the copy when already known.
   */
  private async setOwner(
    path: string,
    src: Stats,
    current: Stats | null = null,
  ): Promise<void> {
    const stats = current ?? (await fs.lstat(path));
    if (
      this.envSvc.isRoot &&
      (stats.uid !== src.uid || stats.gid !== src.gid)
    ) {
      await fs.lchown(path, src.uid, src.gid);
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
    const file = join(this.pathSvc.dataPath, 'containerbase.db');
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
