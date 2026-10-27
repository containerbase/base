import type { Dirent, Stats } from 'node:fs';
import fs from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { env } from 'node:process';
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is';
import { bindingScopeValues, inject, injectable } from 'inversify';
import {
  fileRights,
  isInside,
  logger,
  pathExists,
  spawn,
  tool2path,
} from '../utils/index.ts';
import { EnvService } from './env.service.ts';

export interface FileOwnerConfig {
  /**
   * file or folder
   */
  path: string;
  mode?: number;
}

/**
 * The error for a folder that can't be written. The message starts with the
 * error code, eg. `EROFS`, which is also kept as `code`, with the original
 * error as `cause`.
 */
function writeError(
  err: NodeJS.ErrnoException,
  path: string,
  reason: string,
): NodeJS.ErrnoException {
  return Object.assign(
    new Error(`${err.code}: can't write to ${path}, ${reason}`, {
      cause: err,
    }),
    { code: err.code },
  );
}

/**
 * The error of a write check of the folder, `null` when files can be created
 * in it, which needs write and search permission.
 */
function accessError(path: string): Promise<NodeJS.ErrnoException | null> {
  return fs.access(path, fs.constants.W_OK | fs.constants.X_OK).then(
    () => null,
    (err: NodeJS.ErrnoException) => err,
  );
}

/** The entries a folder dedicated to containerbase may hold. */
const dedicatedEntries = new Set([
  'tool.init.d',
  'cache',
  'ipc.sock',
  'lost+found',
]);

/**
 * Whether the folder is dedicated to containerbase, so it may be taken over:
 * every entry is one of a containerbase temp folder or `lost+found` of a new
 * file system. An empty folder counts as well, a folder which can't be read
 * doesn't.
 */
async function isDedicated(path: string): Promise<boolean> {
  const entries = await fs.readdir(path).catch((err: unknown) => {
    logger.debug({ err, tmpDir: path }, 'can not read the tmp dir');
    return null;
  });
  return entries?.every((entry) => dedicatedEntries.has(entry)) ?? false;
}

/**
 * Whether the containerbase user can create files in the folder, from its
 * owner, group and mode. The user is in the root group, its own group and
 * its primary group.
 */
function canUserWrite(
  { uid, gid, mode }: Pick<Stats, 'uid' | 'gid' | 'mode'>,
  userId: number,
  primaryGroupId: number,
): boolean {
  let wx = 0o003;
  if (uid === userId) {
    wx = 0o300;
  } else if (gid === 0 || gid === userId || gid === primaryGroupId) {
    wx = 0o030;
  }
  return (mode & wx) === wx;
}

/** The target of the link, `null` when the path is no link. */
async function readLink(path: string): Promise<string | null> {
  return await fs.readlink(path).catch(() => null);
}

/** Whether the error is `EEXIST`, eg. from another process. */
function isExistsError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'EEXIST';
}

/** Whether the error is `ENOENT`, eg. a path removed by another process. */
function isMissingError(err: unknown): boolean {
  return (err as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Whether the error is a missing permission or a read-only file system,
 * `EPERM`, `EACCES` or `EROFS`.
 */
function isPermissionError(err: unknown): boolean {
  const { code } = err as NodeJS.ErrnoException;
  return code === 'EPERM' || code === 'EACCES' || code === 'EROFS';
}

/**
 * The real path of `path`. For a missing path, its nearest existing parent is
 * resolved and the missing part appended, eg. the target a folder created at
 * `path` would get.
 *
 * @throws when the path can't be resolved, eg. a link cycle
 */
async function resolvePath(path: string): Promise<string> {
  try {
    return await fs.realpath(path);
  } catch (err) {
    if (!isMissingError(err)) {
      throw err;
    }
    // the root always resolves, which ends the recursion
    return join(await resolvePath(dirname(path)), basename(path));
  }
}

/**
 * Moves the entries of `src` into `dst`, merging folders and keeping the
 * entries which already exist in `dst`. Uses `mv` when renaming fails across
 * devices, eg. for folders of a lower overlay layer, as it keeps the owner.
 * Entries removed by another process meanwhile are skipped. Calls `onMove`
 * after each moved entry.
 */
async function moveDirContents(
  src: string,
  dst: string,
  onMove: () => void,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(src, { withFileTypes: true });
  } catch (err) {
    if (isMissingError(err)) {
      return;
    }
    throw err;
  }
  for (const entry of entries) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    const existing = await fs.lstat(to).catch(() => null);
    if (!existing) {
      try {
        await fs.rename(from, to);
      } catch (err) {
        if (isMissingError(err)) {
          continue;
        }
        if ((err as NodeJS.ErrnoException).code !== 'EXDEV') {
          throw err;
        }
        await spawn('mv', [from, to]);
      }
      onMove();
    } else if (entry.isDirectory() && existing.isDirectory()) {
      await moveDirContents(from, to, onMove);
    }
  }
}

@injectable(bindingScopeValues.Singleton)
export class PathService {
  @inject(EnvService)
  private readonly envSvc!: EnvService;

  /**
   * Path to `tool.init.d` in the containerbase temp folder, below a configured
   * `CONTAINERBASE_TMP_DIR` or `/tmp/containerbase`. The tool wrappers check
   * the marker through `/tmp/containerbase` instead, see `LinkToolService`.
   */
  private get _toolInitPath(): string {
    return join(this.tmpDir, 'tool.init.d');
  }
  /**
   * Path to `/var/lib/containerbase/tool.prep.d`.
   */
  private get _toolPrepPath(): string {
    return join(this.varPath, 'tool.prep.d');
  }

  /**
   * Path to `/opt/containerbase/bin`.
   */
  get binDir(): string {
    return join(this.installDir, 'bin');
  }

  /**
   * Path to `/tmp/containerbase/cache`. It always uses the default temp
   * folder, which links to a configured `CONTAINERBASE_TMP_DIR`, so the home
   * symlinks pointing to it stay valid.
   */
  get cachePath(): string {
    return join(this.defaultTmpDir, 'cache');
  }

  /**
   * Path to `/tmp/containerbase`, the default containerbase temp folder.
   */
  get defaultTmpDir(): string {
    return this.envSvc.defaultContainerbaseTmpDir;
  }

  /**
   * Path to `/opt/containerbase/data`.
   */
  get dataPath(): string {
    return join(this.installDir, 'data');
  }

  /**
   * Path to `/usr/local/etc/env`, the global env file.
   */
  get envFile(): string {
    return join(this.envSvc.rootDir, 'usr/local/etc/env');
  }

  /**
   * Path to `/tmp/containerbase/ipc.sock`, below the default temp folder.
   */
  get ipcSocketPath(): string {
    return join(this.defaultTmpDir, 'ipc.sock');
  }

  /**
   * Path to `/opt/containerbase`.
   */
  get installDir(): string {
    return join(this.envSvc.rootDir, 'opt/containerbase');
  }

  /**
   * Path to `/opt/containerbase/ssl`.
   */
  get sslPath(): string {
    return join(this.installDir, 'ssl');
  }

  /**
   * Path to the containerbase temp folder, `CONTAINERBASE_TMP_DIR` or
   * `/tmp/containerbase`.
   */
  get tmpDir(): string {
    return this.envSvc.containerbaseTmpDir;
  }

  /**
   * Path to `/opt/containerbase/tools`.
   */
  get toolsPath(): string {
    return join(this.installDir, 'tools');
  }

  /**
   * Path to `/usr/local/containerbase`.
   */
  get usrPath(): string {
    return join(this.envSvc.rootDir, 'usr/local/containerbase');
  }

  /**
   * Path to `/var/lib/containerbase`.
   */
  get varPath(): string {
    return join(this.envSvc.rootDir, 'var/lib/containerbase');
  }

  /**
   * Path to `/opt/containerbase/versions`.
   */
  get versionPath(): string {
    return join(this.installDir, 'versions');
  }

  /**
   * Creates a folder and its missing parents, owned by the configured user.
   * An existing folder is left as is.
   *
   * @throws when the path exists but is no folder, eg. a symlink or a file
   */
  async createDir(path: string, mode = 0o775): Promise<void> {
    const stats = await fs.lstat(path).catch(() => null);
    if (stats?.isDirectory()) {
      return;
    }
    if (stats) {
      throw new Error(`Path exists and is not a directory: ${path}`);
    }
    const parent = dirname(path);
    if (!(await pathExists(parent))) {
      await this.createDir(parent, 0o775);
    }
    logger.debug({ path }, 'creating dir');
    await fs.mkdir(path);
    await this.setOwner({ path, mode });
  }

  /**
   * Creates a symlink at `path` pointing to `target`. An existing file,
   * folder or link at `path` is left as is.
   */
  async createSymlink(target: string, path: string): Promise<void> {
    const stats = await fs.lstat(path).catch(() => null);
    if (stats) {
      logger.debug({ path }, 'path exists, skipping symlink');
      return;
    }
    await fs.symlink(target, path);
  }

  /**
   * Creates a temp folder below the containerbase temp dir, passes it to
   * `fn`, and always removes it afterwards, also when `fn` throws.
   */
  async withTempDir<T>(
    prefix: string,
    fn: (dir: string) => Promise<T>,
  ): Promise<T> {
    const dir = await fs.mkdtemp(join(this.envSvc.tmpDir, prefix));
    try {
      return await fn(dir);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  /** Creates the tool path and returns it. */
  async createToolPath(tool: string): Promise<string> {
    const toolPath = this.toolPath(tool);
    await this.createDir(toolPath);
    return toolPath;
  }

  /**
   * Creates the versioned tool path and the optional sub folders below it,
   * eg. `bin`, all owned by the configured user with the configured umask.
   * Returns the innermost path.
   */
  async createVersionedToolPath(
    tool: string,
    version: string,
    ...subPaths: string[]
  ): Promise<string> {
    let path = this.versionedToolPath(tool, version);
    await this.createDir(path, this.envSvc.umask);
    for (const sub of subPaths) {
      path = join(path, sub);
      await this.createDir(path, this.envSvc.umask);
    }
    return path;
  }

  /**
   * Creates the containerbase folders below the install, var and temp paths,
   * and the link to a configured `CONTAINERBASE_TMP_DIR`, see `ensureTmpLink`.
   *
   * @throws when the image was not set up for containerbase
   */
  async ensureBasePaths(): Promise<void> {
    if (!(await pathExists(this.varPath, 'dir'))) {
      throw new Error('System not initialized for containerbase');
    }
    await this.ensureTmpLink();
    await this.createDir(this._toolPrepPath);
    await this.createDir(this.dataPath);
    await this.createDir(this.toolsPath);
    await this.createDir(this.versionPath);
    await this.createDir(this.binDir);
    await this.createDir(this.sslPath);
    await this.createDir(this._toolInitPath);
    await this.createDir(join(this.cachePath, '.cache'));
    await this.createDir(join(this.cachePath, '.config'));
    await this.createDir(join(this.cachePath, '.local', 'share'));
    // targets of the `~/.npm` and `~/.yarn` links, also used without node's init
    await this.ensureCacheDir('.npm');
    await this.ensureCacheDir('.yarn');
  }

  /**
   * Creates a folder in the cache path, eg. the target of a home folder link.
   * A link to a folder, eg. a volume, is kept, a link to a missing target is
   * skipped.
   */
  async ensureCacheDir(name: string): Promise<void> {
    const path = join(this.cachePath, name);
    if (await pathExists(path, 'dir')) {
      return;
    }
    if ((await fs.lstat(path).catch(() => null))?.isSymbolicLink()) {
      logger.debug({ path }, 'cache link target missing');
      return;
    }
    await this.createDir(path);
  }

  /**
   * Creates a configured `CONTAINERBASE_TMP_DIR` and links
   * `/tmp/containerbase` to it, so writes to `cachePath` land there. A link
   * to another target is replaced. As root, a folder, eg. from the base image,
   * is moved into the configured one first, keeping entries which exist there.
   * The configured folder may be a link to a folder. Without a configured
   * folder, a leftover link at `/tmp/containerbase` is repaired, see
   * `repairDefaultLink`.
   *
   * When the switch isn't possible, eg. as non-root with a folder at
   * `/tmp/containerbase` or without write access to the configured folder,
   * this run keeps using the default folder, see `keepDefaultTmpDir`.
   *
   * @throws when `/tmp/containerbase` is a file, or when moving its entries
   * started and a later step fails
   */
  async ensureTmpLink(): Promise<void> {
    const tmpDir = this.tmpDir;
    const link = this.defaultTmpDir;
    if (tmpDir === link) {
      await this.repairDefaultLink();
      return;
    }
    const stats = await fs.lstat(link).catch(() => null);
    if (stats && !stats.isDirectory() && !stats.isSymbolicLink()) {
      throw new Error(`${link} is a file, remove it`);
    }
    if (stats?.isDirectory() && !this.envSvc.isRoot) {
      // removing it from the sticky `/tmp` needs root
      await this.keepDefaultTmpDir(
        tmpDir,
        `${link} is a folder, switch it at image build time as root`,
      );
      return;
    }
    // checked first, so nothing below `/tmp` is created or owned
    const problem =
      (await this.tmpResolveProblem(tmpDir)) ??
      (await this.prepareTmpDir(tmpDir));
    if (problem) {
      await this.keepDefaultTmpDir(tmpDir, problem);
      return;
    }
    if (stats?.isSymbolicLink() && (await readLink(link)) === tmpDir) {
      return;
    }
    // falling back is only safe while nothing was moved yet
    const move = { started: false };
    try {
      if (stats?.isSymbolicLink()) {
        logger.debug({ link, tmpDir }, 'replacing stale tmp dir link');
        // a link removed by another process meanwhile is fine
        await fs.rm(link, { force: true });
      } else if (stats?.isDirectory()) {
        logger.debug({ link, tmpDir }, 'moving tmp dir folder');
        await moveDirContents(link, tmpDir, () => {
          move.started = true;
        });
        // removing it may already have deleted entries
        move.started = true;
        await fs.rm(link, { recursive: true, force: true });
      }
      await fs.symlink(tmpDir, link);
    } catch (err) {
      // another process may have created the same link meanwhile
      if (isExistsError(err) && (await readLink(link)) === tmpDir) {
        return;
      }
      if (move.started || !isPermissionError(err)) {
        throw err;
      }
      await this.keepDefaultTmpDir(tmpDir, `${link} can't be linked to it`);
    }
  }

  /**
   * Creates the configured temp folder when it's missing and checks that the
   * current user can write it, as root also the configured user. Another
   * process creating it meanwhile is fine. As root, an existing root owned
   * folder dedicated to containerbase, see `isDedicated`, is given to the
   * configured user, keeping its mode. A shared folder with the sticky bit,
   * eg. `/var/tmp`, is never used.
   *
   * @returns why the folder is not usable, `null` when it is
   */
  private async prepareTmpDir(tmpDir: string): Promise<string | null> {
    let stats: Stats | null = null;
    try {
      stats = await fs.stat(tmpDir);
    } catch (err) {
      if (!isMissingError(err)) {
        logger.debug({ err, tmpDir }, 'can not stat the tmp dir');
        return `${tmpDir} can't be resolved`;
      }
      if (await fs.lstat(tmpDir).catch(() => null)) {
        // `stat` misses the path while `lstat` finds it, so the link target is missing
        return `${tmpDir} is a dangling link`;
      }
    }
    // the owner the configured user's write check uses, a created folder is
    // already given to the user by `createDir`
    let owner: Pick<Stats, 'uid' | 'gid' | 'mode'> | null = null;
    if (stats) {
      if (!stats.isDirectory()) {
        return `${tmpDir} is not a directory`;
      }
      // the sticky bit
      if (stats.mode & 0o1000) {
        return `${tmpDir} is a shared folder`;
      }
      owner = stats;
      if (
        this.envSvc.isRoot &&
        stats.uid === 0 &&
        (await isDedicated(tmpDir))
      ) {
        try {
          await fs.chown(tmpDir, this.envSvc.userId, 0);
          owner = { uid: this.envSvc.userId, gid: 0, mode: stats.mode };
        } catch (err) {
          logger.debug({ err, tmpDir }, 'can not own the tmp dir');
        }
      }
    } else {
      try {
        await fs.mkdir(dirname(tmpDir), { recursive: true });
        await this.createDir(tmpDir);
      } catch (err) {
        if (!isExistsError(err) || !(await pathExists(tmpDir, 'dir'))) {
          logger.debug({ err, tmpDir }, 'can not create the tmp dir');
          return `${tmpDir} can't be created`;
        }
      }
    }
    const err = await accessError(tmpDir);
    if (err) {
      logger.debug({ err, tmpDir }, 'configured tmp dir is not writable');
      return `${tmpDir} is not writable`;
    }
    if (
      this.envSvc.isRoot &&
      owner &&
      !canUserWrite(owner, this.envSvc.userId, this.envSvc.primaryGroupId)
    ) {
      return `${tmpDir} is not writable for the user`;
    }
    return null;
  }

  /**
   * Why the configured temp folder can't be used when it resolves to `/tmp` or
   * below it, eg. a link to `/tmp/containerbase`. Moving the default folder
   * into it or linking it would lose the content or create a link cycle. A
   * missing folder counts when it would be created there, eg. below a link to
   * `/tmp`. A folder which can't be resolved, eg. a link cycle, can't be used
   * either.
   *
   * @returns the reason, `null` when the folder is outside of `/tmp`
   */
  private async tmpResolveProblem(tmpDir: string): Promise<string | null> {
    let inside: boolean;
    try {
      inside = isInside(
        await fs.realpath(this.envSvc.tmpDir),
        await resolvePath(tmpDir),
      );
    } catch (err) {
      logger.debug({ err, tmpDir }, 'can not resolve the tmp dir');
      return `${tmpDir} can't be resolved`;
    }
    return inside ? `${tmpDir} resolves into ${this.envSvc.tmpDir}` : null;
  }

  /**
   * Warns with the `reason` that the default folder can't be switched to the
   * configured one and keeps using the default folder for this run, also in
   * child processes, by setting `CONTAINERBASE_TMP_DIR` to it. A link from the
   * default folder to the unusable configured one is replaced, see
   * `repairDefaultLink`.
   *
   * @throws when that link can't be removed
   */
  private async keepDefaultTmpDir(
    tmpDir: string,
    reason: string,
  ): Promise<void> {
    const link = this.defaultTmpDir;
    logger.warn(
      `cannot switch ${link} to ${tmpDir}, keeping the default folder: ${reason}`,
    );
    env.CONTAINERBASE_TMP_DIR = link;
    await this.repairDefaultLink(tmpDir);
  }

  /**
   * Replaces a link at `/tmp/containerbase` by a real folder, unless it links
   * to a writable folder other than `unusable`. This repairs eg. a link left
   * from an older `CONTAINERBASE_TMP_DIR` whose target is missing.
   *
   * @throws when the link can't be removed
   */
  private async repairDefaultLink(unusable?: string): Promise<void> {
    const link = this.defaultTmpDir;
    const target = await readLink(link);
    if (
      target === null ||
      // a relative target is relative to the folder of the link
      (resolve(dirname(link), target) !== unusable &&
        (await pathExists(link, 'dir')) &&
        (await accessError(link)) === null)
    ) {
      return;
    }
    try {
      await fs.rm(link);
    } catch (err) {
      if (!isPermissionError(err)) {
        throw err;
      }
      throw new Error(
        `${link} links to ${target} which is not usable; remove the link or fix the permissions`,
        { cause: err },
      );
    }
    await this.createDir(link);
  }

  /**
   * Checks that the containerbase data, tools, bin and versions folders and
   * the extra `paths` are writable, so a command fails before resolving or
   * downloading anything. For a missing folder, which `ensureBasePaths`
   * creates, its nearest existing parent is checked.
   *
   * @throws when a folder is on a read-only file system or the current user
   * can't write it
   */
  async ensureWritable(...paths: string[]): Promise<void> {
    await this.ensureWritableDirs(
      this.dataPath,
      this.toolsPath,
      this.binDir,
      this.versionPath,
      ...paths,
    );
  }

  /**
   * Checks that exactly the given folders are writable. For a missing folder
   * its nearest existing parent is checked, where it would be created.
   *
   * @throws when a folder is on a read-only file system or the current user
   * can't write it
   */
  async ensureWritableDirs(...paths: string[]): Promise<void> {
    for (const path of paths) {
      let dir = path;
      let err = await accessError(dir);
      while (err?.code === 'ENOENT' && dirname(dir) !== dir) {
        dir = dirname(dir);
        err = await accessError(dir);
      }
      switch (err?.code) {
        case 'EROFS':
          throw writeError(
            err,
            path,
            'the file system is read-only. Install tools at image build time or mount the containerbase folders writable.',
          );
        case 'EACCES':
          throw writeError(
            err,
            path,
            'the current user has no write permission. Run as root or as the user owning the folder.',
          );
      }
    }
  }

  /** Returns the tool path, creating it when missing. */
  async ensureToolPath(tool: string): Promise<string> {
    return (await this.findToolPath(tool)) ?? (await this.createToolPath(tool));
  }

  /** Returns the tool path when it exists, else `null`. */
  async findToolPath(tool: string): Promise<string | null> {
    const toolPath = this.toolPath(tool);

    if (await pathExists(toolPath, 'dir')) {
      return toolPath;
    }
    return null;
  }

  /** Returns the versioned tool path when it exists, else `null`. */
  async findVersionedToolPath(
    tool: string,
    version: string,
  ): Promise<string | null> {
    const versionedToolPath = this.versionedToolPath(tool, version);

    if (await pathExists(versionedToolPath, 'dir')) {
      return versionedToolPath;
    }
    return null;
  }

  /**
   * Returns the names of the v2 shell tools. The repository ships none, so
   * only images, and custom images adding their own, have the folder.
   */
  async findLegacyTools(): Promise<string[]> {
    const dir = join(this.usrPath, 'tools/v2');
    if (!(await pathExists(dir, 'dir'))) {
      return [];
    }
    const tools = await fs.readdir(dir);
    return tools
      .filter((t) => t.endsWith('.sh'))
      .map((t) => t.substring(0, t.length - 3));
  }

  /** Returns the names of the tools prepared in this image. */
  async findPreparedTools(): Promise<string[]> {
    const file = join(this.varPath, 'tool.prep');

    if (!(await this.fileExists(file))) {
      return [];
    }

    return (await fs.readFile(file, 'utf-8'))
      .split('\n')
      .filter(isNonEmptyStringAndNotWhitespace);
  }

  /** Whether the path exists and is a file. */
  async fileExists(filePath: string): Promise<boolean> {
    return await pathExists(filePath, 'file');
  }

  /** Whether the tool was initialized in this container. */
  async isInitialized(tool: string): Promise<boolean> {
    return await this.fileExists(this.toolInitPath(tool));
  }

  /** Whether the tool was prepared in this image. */
  async isPrepared(tool: string): Promise<boolean> {
    return await this.fileExists(this.toolPreparePath(tool));
  }

  /** Whether the tool is a v2 shell tool, or with `v1` also a v1 one. */
  async isLegacyTool(tool: string, v1 = false): Promise<boolean> {
    let exists = await pathExists(join(this.usrPath, 'tools/v2', `${tool}.sh`));
    if (!exists && v1) {
      exists = await pathExists(join(this.usrPath, 'tools', `${tool}.sh`));
    }
    return exists;
  }

  /** Marks the tool as initialized in this container. */
  async setInitialized(tool: string): Promise<void> {
    const path = this.toolInitPath(tool);
    await fs.writeFile(path, '');
    await this.setOwner({ path });
  }

  /** Marks the tool as prepared and adds it to the list of prepared tools. */
  async setPrepared(tool: string): Promise<void> {
    await fs.writeFile(this.toolPreparePath(tool), '');
    await fs.appendFile(join(this.varPath, 'tool.prep'), `${tool}\n`);
  }

  /** Path of the tool's initialized marker file. */
  toolInitPath(tool: string): string {
    return join(this._toolInitPath, tool2path(tool));
  }

  /** Path to `/opt/containerbase/tools/<tool>`. */
  toolPath(tool: string): string {
    return join(this.toolsPath, tool2path(tool));
  }

  /** Path of the tool's prepared marker file. */
  toolPreparePath(tool: string): string {
    return join(this._toolPrepPath, tool2path(tool));
  }

  /** Path to `/opt/containerbase/tools/<tool>/<version>`. */
  versionedToolPath(tool: string, version: string): string {
    return join(this.toolPath(tool), version);
  }

  /**
   * Exports the variables to the global env file and sets them in the current
   * process. The env file keeps values that are already set when it is
   * sourced. With `nonRootOnly` they only apply to non-root users and are not
   * set in the current process.
   */
  async exportEnv(
    values: Record<string, string>,
    nonRootOnly = false,
  ): Promise<void> {
    let content = '';

    if (nonRootOnly) {
      // eslint-disable-next-line no-template-curly-in-string
      content += 'if [ "${EUID}" != 0 ]; then\n';
    }

    for (const [key, value] of Object.entries(values)) {
      if (nonRootOnly === false) {
        env[key] = value;
      }
      content += `export ${key}=\${${key}-${value}}\n`;
    }

    if (nonRootOnly) {
      content += 'fi\n';
    }

    await fs.appendFile(this.envFile, content);
  }

  /** Prepends the folder to `PATH` in the global env file and the process. */
  async exportPath(value: string): Promise<void> {
    env.PATH = `${value}:${env.PATH}`;
    await fs.appendFile(this.envFile, `export PATH=${value}:$PATH\n`);
  }

  /** Whether the tool has an `env.sh`. */
  async toolEnvExists(tool: string): Promise<boolean> {
    const file = join(this.toolPath(tool), 'env.sh');
    return await pathExists(file);
  }

  /** Removes the tool's `env.sh`, if any. */
  async resetToolEnv(tool: string): Promise<Promise<void>> {
    const file = join(this.toolPath(tool), 'env.sh');
    if (!(await pathExists(file))) {
      return;
    }

    await fs.rm(file, { force: true });
  }

  /**
   * Appends a block to the tool env, `content` should end with a newline, eg.
   * by using the `fileContent` tag.
   */
  async exportToolEnvContent(tool: string, content: string): Promise<void> {
    const file = join(await this.ensureToolPath(tool), 'env.sh');
    await fs.appendFile(file, `\n${content}`);
    await this.setOwner({ path: file, mode: 0o644 });
  }

  /**
   * Writes the variables to the tool's `env.sh` and sets them in the current
   * process. The `env.sh` keeps values that are already set when it is
   * sourced. With `nonRootOnly` they only apply to non-root users and are not
   * set in the current process.
   */
  async exportToolEnv(
    tool: string,
    values: Record<string, string>,
    nonRootOnly = false,
  ): Promise<void> {
    const file = join(await this.ensureToolPath(tool), 'env.sh');
    let content = '';

    if (nonRootOnly) {
      // eslint-disable-next-line no-template-curly-in-string
      content += 'if [ "${EUID}" != 0 ]; then\n';
    }

    for (const [key, value] of Object.entries(values)) {
      if (nonRootOnly === false) {
        env[key] = value;
      }
      content += `export ${key}=\${${key}-${value}}\n`;
    }

    if (nonRootOnly) {
      content += 'fi\n';
    }

    await this.writeFile(file, content);
  }

  /**
   * Adds the folder to `PATH` in the tool's `env.sh` and the current process,
   * in front or with `toEnd` at the end.
   */
  async exportToolPath(
    tool: string,
    value: string,
    toEnd = false,
  ): Promise<void> {
    const file = join(await this.ensureToolPath(tool), 'env.sh');

    if (toEnd) {
      env.PATH = `${env.PATH}:${value}`;
      await fs.appendFile(file, `export PATH=$PATH:${value}\n`);
    } else {
      env.PATH = `${value}:${env.PATH}`;
      await fs.appendFile(file, `export PATH=${value}:$PATH\n`);
    }

    await this.setOwner({ path: file, mode: 0o664 });
  }

  /**
   * Sets the mode of the path, and when running as root gives the configured
   * user ownership of root owned paths.
   */
  async setOwner({ path, mode = 0o775 }: FileOwnerConfig): Promise<void> {
    const s = await fs.stat(path);
    if ((s.mode & fileRights) !== mode) {
      logger.debug({ path, mode, s: s.mode & fileRights }, 'setting path mode');
      await fs.chmod(path, mode);
    }
    if (this.envSvc.isRoot && s.uid === 0) {
      await fs.chown(path, this.envSvc.userId, 0);
    }
  }

  /**
   * Write content to file and set permissions.
   * @param file path to file
   * @param content content to write
   * @param mode fille access mode
   */
  async writeFile(file: string, content: string, mode = 0o664): Promise<void> {
    await fs.writeFile(file, content);
    await this.setOwner({ path: file, mode });
  }
}
