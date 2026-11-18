import type { Stats } from 'node:fs';
import fs from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { inject, injectable } from 'inversify';
import { logger } from '../utils/index.ts';
import { EnvService } from './env.service.ts';
import { PathService } from './path.service.ts';
import {
  SnapshotService,
  databaseFile,
  ifMissing,
  linksFile,
  lstat,
  readdir,
  stampFile,
  tmpPath,
} from './snapshot.service.ts';

/**
 * The files a restore copied into `/opt/containerbase`, with their
 * signature, see `signature`.
 */
const manifestFile = '.restored';

/** Restored files by their path relative to `/opt/containerbase`. */
type Manifest = Record<string, string>;

/** A folder of the snapshot to restore, see `SnapshotService.writeIndex`. */
interface LinkedFolder {
  /** The path relative to `/opt/containerbase`. */
  rel: string;
  /** Whether a volume needs a copy of the folder instead of a link. */
  copy: boolean;
}

/**
 * The signature of a restored file or link: the link target, or the size and
 * modification time of a file, which a restore sets from the snapshot.
 */
async function signature(path: string, stats: Stats): Promise<string> {
  return stats.isSymbolicLink()
    ? `l ${await fs.readlink(path)}`
    : `f ${stats.size} ${Math.trunc(stats.mtimeMs)}`;
}

/** Whether the current user can write the folder. */
function isWritable(path: string): Promise<boolean> {
  return fs.access(path, fs.constants.W_OK).then(
    () => true,
    () => false,
  );
}

/** Whether the error has the code, eg. `ENOENT` for a missing file. */
function hasCode(err: unknown, code: string): boolean {
  return (err as NodeJS.ErrnoException).code === code;
}

/**
 * Whether the folder is a mount point, eg. a volume, as it's on another
 * device than its parent.
 */
async function isMountPoint(path: string): Promise<boolean> {
  const [stats, parent] = await Promise.all([
    fs.stat(path),
    fs.stat(dirname(path)),
  ]);
  return stats.dev !== parent.dev;
}

/**
 * Restores `/opt/containerbase` from the build-time snapshot, see
 * `SnapshotService`, eg. a volume mounted there, which hides what the image
 * installed. It needs no install services and doesn't open the database, so
 * it runs before anything else.
 */
@injectable()
export class RestoreService {
  @inject(PathService)
  private readonly pathSvc!: PathService;
  @inject(EnvService)
  private readonly envSvc!: EnvService;
  @inject(SnapshotService)
  private readonly snapshotSvc!: SnapshotService;

  /**
   * Whether `/opt/containerbase` needs a restore from the snapshot: when its
   * stamp differs from the stamp of the snapshot, eg. an empty volume, or
   * when it's a writable volume where a folder which needs a copy, see
   * `restoreFolders`, still links to the snapshot, eg. a volume docker filled
   * from the image. An image without a snapshot, or the image's own
   * `/opt/containerbase` without a volume, needs none.
   *
   * @throws when a stamp or the list of folders can't be read
   */
  async needsRestore(): Promise<boolean> {
    const { installDir, snapshotDir } = this.pathSvc;
    const stamp = await this.snapshotSvc.readStamp(snapshotDir);
    if (stamp === null) {
      logger.debug('restore: no snapshot');
      return false;
    }
    if (stamp !== (await this.snapshotSvc.readStamp(installDir))) {
      return true;
    }
    if (
      !(await this.hasLinkedCopies()) ||
      !(await isWritable(installDir)) ||
      !(await isMountPoint(installDir))
    ) {
      logger.debug('restore: /opt/containerbase matches the snapshot');
      return false;
    }
    return true;
  }

  /**
   * Restores `/opt/containerbase` from the snapshot, when it needs it, see
   * `needsRestore`:
   *
   * - removes links to version folders the snapshot no longer has, eg. from
   *   an older image,
   * - links or copies the version folders, see `restoreFolders`,
   * - copies the files outside of the version folders, see `restoreFiles`,
   *   and the database when there is none,
   * - writes the stamp of the snapshot.
   *
   * As root, the created folders and files are given to the user.
   *
   * @throws when `/opt/containerbase` isn't writable, before changing
   * anything
   */
  async restore(): Promise<void> {
    if (!(await this.needsRestore())) {
      return;
    }
    const { installDir, snapshotDir } = this.pathSvc;
    await this.pathSvc.ensureWritableDirs(
      installDir,
      this.pathSvc.toolsPath,
      this.pathSvc.dataPath,
      ...this.snapshotSvc.filePaths,
    );
    logger.info('restoring /opt/containerbase from the snapshot');

    if (this.envSvc.isRoot) {
      await this.pathSvc.setOwner({ path: installDir });
    }
    await this.pruneLinks();
    await this.restoreFolders();
    await this.restoreFiles();
    await this.restoreDatabase();
    const stamp = (await this.snapshotSvc.readStamp(snapshotDir))!;
    await this.pathSvc.writeFile(join(installDir, stampFile), stamp);
  }

  /**
   * The folders listed in `.links` of the snapshot.
   *
   * @throws when the list can't be read, eg. missing permissions
   */
  private async readFolders(): Promise<LinkedFolder[]> {
    const content = await fs
      .readFile(join(this.pathSvc.snapshotDir, linksFile), 'utf8')
      .catch(ifMissing(''));
    return content
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => ({ rel: line.slice(2), copy: line.startsWith('c ') }));
  }

  /**
   * Whether the folder in `/opt/containerbase` links to its copy in the
   * snapshot.
   */
  private async linksToSnapshot(rel: string): Promise<boolean> {
    const path = join(this.pathSvc.installDir, rel);
    return (
      !!(await lstat(path))?.isSymbolicLink() &&
      (await fs.readlink(path)) === join(this.pathSvc.snapshotDir, rel)
    );
  }

  /** Whether a folder which needs a copy still links to the snapshot. */
  private async hasLinkedCopies(): Promise<boolean> {
    for (const { rel, copy } of await this.readFolders()) {
      if (copy && (await this.linksToSnapshot(rel))) {
        return true;
      }
    }
    return false;
  }

  /** Removes the links to version folders missing in the snapshot. */
  private async pruneLinks(): Promise<void> {
    for (const { path, target } of await this.snapshotSvc.findLinks()) {
      if (!(await lstat(target))) {
        logger.debug({ path, target }, 'restore: removing a dangling link');
        await fs.rm(path, { force: true });
      }
    }
  }

  /**
   * Links the version folders of the snapshot into `/opt/containerbase`.
   * The folders of tools which write into their install folder at runtime
   * are copied instead, also replacing a link to the snapshot, so their
   * writes persist with the volume, see `copy`. Other existing paths are
   * kept, eg. a folder installed at runtime.
   */
  private async restoreFolders(): Promise<void> {
    const { installDir, snapshotDir } = this.pathSvc;
    for (const { rel, copy } of await this.readFolders()) {
      const target = join(snapshotDir, rel);
      const path = join(installDir, rel);
      if (!(await lstat(target))?.isDirectory()) {
        continue;
      }
      if ((await lstat(path)) && !(copy && (await this.linksToSnapshot(rel)))) {
        continue;
      }
      await this.pathSvc.createDir(dirname(path));
      if (copy) {
        logger.debug({ path, target }, 'restore: copying a version folder');
        await this.copy(target, path);
      } else {
        await this.link(target, path);
      }
    }
  }

  /**
   * Copies a file, link or folder of the snapshot into a temp path next to
   * `path` and renames it into place, replacing a link, so an interrupted
   * copy never looks complete. A temp path left by an interrupted restore is
   * removed first.
   *
   * @throws when it can't be copied or renamed
   */
  private async copy(src: string, path: string): Promise<void> {
    const tmp = tmpPath(path);
    await fs.rm(tmp, { recursive: true, force: true });
    await this.snapshotSvc.copy(src, tmp);
    if ((await lstat(path))?.isSymbolicLink()) {
      await fs.rm(path);
    }
    await fs.rename(tmp, path);
  }

  /**
   * Links a version folder of the snapshot.
   *
   * @throws when the link can't be created
   */
  private async link(target: string, path: string): Promise<void> {
    logger.debug({ path, target }, 'restore: linking a version folder');
    await fs.symlink(target, path);
  }

  /**
   * Copies the `bin`, `lib`, `env.d`, `versions` and `ssl` folders and the
   * `env.sh` of every tool from the snapshot, see `restoreEntry`. Files an
   * earlier restore copied which the snapshot no longer has are removed,
   * unless they changed since. The copied files are recorded in
   * `.restored`, an unreadable record counts as empty.
   */
  private async restoreFiles(): Promise<void> {
    const { installDir } = this.pathSvc;
    const file = join(installDir, manifestFile);
    let previous: Manifest = {};
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('not an object');
      }
      previous = parsed as Manifest;
    } catch (err) {
      if (!hasCode(err, 'ENOENT')) {
        logger.warn({ err, file }, 'restore: ignoring an unreadable record');
      }
    }
    const next: Manifest = {};
    for (const path of this.snapshotSvc.filePaths) {
      await this.restoreEntry(relative(installDir, path), previous, next);
    }
    const tools = this.snapshotSvc.snapshotPath(this.pathSvc.toolsPath);
    for (const tool of await readdir(tools)) {
      await this.restoreEntry(join('tools', tool, 'env.sh'), previous, next);
    }
    for (const [rel, sig] of Object.entries(previous)) {
      const path = join(installDir, rel);
      const stats = await lstat(path);
      if (!(rel in next) && stats && (await signature(path, stats)) === sig) {
        logger.debug({ path }, 'restore: removing a file of an older snapshot');
        await fs.rm(path, { force: true });
        await this.removeEmptyParents(path);
      }
    }
    const tmp = tmpPath(file);
    await this.pathSvc.writeFile(tmp, JSON.stringify(next));
    await fs.rename(tmp, file);
  }

  /**
   * Copies a file, link or folder from the snapshot, recursively. A file or
   * link is copied when it's missing, or when an earlier restore copied it
   * and it didn't change since, so runtime changes, eg. the wrappers of a
   * tool installed at runtime, are kept. An existing file which equals the
   * snapshot copy, eg. copied by docker into a new volume, is recorded as
   * restored.
   */
  private async restoreEntry(
    rel: string,
    previous: Manifest,
    next: Manifest,
  ): Promise<void> {
    const src = join(this.pathSvc.snapshotDir, rel);
    const dst = join(this.pathSvc.installDir, rel);
    const srcStats = await lstat(src);
    if (!srcStats) {
      return;
    }
    const dstStats = await lstat(dst);
    if (srcStats.isDirectory()) {
      if (!dstStats) {
        await this.pathSvc.createDir(dst);
      } else if (!dstStats.isDirectory()) {
        return;
      }
      for (const entry of await readdir(src)) {
        await this.restoreEntry(join(rel, entry), previous, next);
      }
      return;
    }
    if (dstStats) {
      const sig = await signature(dst, dstStats);
      if (previous[rel] !== sig) {
        if (sig === (await signature(src, srcStats))) {
          next[rel] = sig;
        }
        return;
      }
    }
    await this.pathSvc.createDir(dirname(dst));
    await this.copy(src, dst);
    next[rel] = await signature(dst, await fs.lstat(dst));
  }

  /**
   * Removes the folders above a removed file which are empty now, up to the
   * `bin`, `lib`, `env.d`, `versions`, `ssl` and `tools` folders, eg. a
   * folder an older snapshot had.
   *
   * @throws when a folder can't be removed for another reason than holding
   * other entries
   */
  private async removeEmptyParents(path: string): Promise<void> {
    const keep = new Set([
      this.pathSvc.installDir,
      this.pathSvc.toolsPath,
      ...this.snapshotSvc.filePaths,
    ]);
    for (let dir = dirname(path); !keep.has(dir); dir = dirname(dir)) {
      try {
        await fs.rmdir(dir);
      } catch (err) {
        if (hasCode(err, 'ENOTEMPTY')) {
          return;
        }
        throw err;
      }
    }
  }

  /**
   * Copies the database from the snapshot through a temp file, when there is
   * none, see `copy`.
   */
  private async restoreDatabase(): Promise<void> {
    const file = join(this.pathSvc.dataPath, databaseFile);
    const src = this.snapshotSvc.snapshotPath(file);
    if (!(await lstat(src)) || (await lstat(file))) {
      return;
    }
    logger.debug({ file }, 'restore: copying the database');
    await this.pathSvc.createDir(this.pathSvc.dataPath);
    await this.copy(src, file);
  }
}
