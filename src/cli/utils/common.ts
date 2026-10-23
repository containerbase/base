import fs, { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import process from 'node:process';
import { deleteAsync } from 'del';
import { logger } from './logger.ts';
import type { CliMode, Distro } from './types.ts';

let distro: undefined | Promise<Distro>;
let isDocker: undefined | Promise<boolean>;

/**
 * Exits the process unless it runs on linux x64 or arm64 with a supported
 * ubuntu release.
 */
export async function validateSystem(): Promise<void> {
  if (os.platform() !== 'linux') {
    logger.fatal(`Unsupported platform: ${os.platform()}! Please use Linux.`);
    process.exit(1);
  }
  if (os.arch() !== 'x64' && os.arch() !== 'arm64') {
    logger.fatal(
      `Unsupported architecture: ${os.arch()}! Please use 'x64' or 'arm64'.`,
    );
    process.exit(1);
  }
  const d = await (distro ??= readDistro());
  // the host distros, see `HostDistroCode`
  switch (d.versionCode) {
    case 'noble':
    case 'resolute':
      break;
    default:
      logger.fatal(
        { distro: d },
        `Unsupported distro: ${d.versionCode}! Please use Ubuntu 'noble' or 'resolute'.`,
      );
      process.exit(1);
  }
}

/** The distro from `/etc/os-release`, read once. */
export async function getDistro(): Promise<Distro> {
  return await (distro ??= readDistro());
}

/**
 * For testing purposes only.
 * @private
 * @internal
 */
/* v8 ignore start */
export function reset(): void {
  distro = undefined;
  isDocker = undefined;
}
/* v8 ignore stop */

/** Parses `/etc/os-release`, falling back to an unknown distro. */
async function readDistro(): Promise<Distro> {
  const data = await readFile('/etc/os-release', { encoding: 'utf-8' });
  const name = /^NAME="?(\w+)"?$/m.exec(data)?.[1];
  const versionCode = /^VERSION_CODENAME="?(\w+)"?$/m.exec(data)?.[1];
  const versionId = /^VERSION_ID="?(\d+\.\d+)"?$/m.exec(data)?.[1];
  if (!name || !versionCode || !versionId) {
    logger.error(
      { data, d: { name, versionCode, versionId } },
      `Couldn't detect distro from '/etc/os-release'.`,
    );
    return { name: 'Unknown', versionCode: 'unknown', versionId: '00.00' };
  }
  logger.debug(
    { distro: { name, versionCode, versionId } },
    'discovered distro',
  );
  return { name, versionCode, versionId };
}

export const fileRights =
  fs.constants.S_IRWXU | fs.constants.S_IRWXG | fs.constants.S_IRWXO;

export type PathType = 'file' | 'dir' | 'symlink' | 'socket';

/** Whether the path exists, optionally with the given type. */
export async function pathExists(
  filePath: string,
  type?: PathType,
): Promise<boolean> {
  try {
    const fstat = await stat(filePath);
    switch (type) {
      case 'file':
        return fstat.isFile();
      case 'dir':
        return fstat.isDirectory();
      case 'symlink':
        return fstat.isSymbolicLink();
      case 'socket':
        return fstat.isSocket();
    }
    return !!fstat;
  } catch {
    return false;
  }
}

/** The binary name shown in the cli help, based on how the cli was called. */
export function parseBinaryName(
  mode: CliMode | null,
  node: string,
  app: string,
): string | undefined {
  if (mode) {
    return mode;
  }

  return process.argv0.endsWith('/node') || process.argv0 === 'node'
    ? `${node} ${app}`
    : process.argv0;
}

/**
 * Whether the absolute `child` path is the `parent` path or below it,
 * comparing the paths only. A relative `child` is never inside.
 */
export function isInside(parent: string, child: string): boolean {
  if (!isAbsolute(child)) {
    return false;
  }
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`);
}

/** The paths of the entries in a folder, none for a missing folder. */
export async function listEntries(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir).catch(() => []);
  return entries.map((entry) => join(dir, entry));
}

/**
 * Gives the owner write permission on a folder and every folder below it, so
 * their entries can be removed. Links are skipped, `chmod` would change their
 * target.
 * @param dir - the folder
 * @param mode - the current mode of the folder
 */
async function makeWritable(dir: string, mode: number): Promise<void> {
  await fs.chmod(dir, (mode & 0o7777) | fs.constants.S_IWUSR);
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const sub = join(dir, entry.name);
      await makeWritable(sub, (await fs.lstat(sub)).mode);
    }
  }
}

/**
 * Removes a file or folder. Folders which can't be removed because of their
 * permissions, eg. the read-only go module cache or the virtualenv seed
 * packages, are made writable first. A link is never made writable, `chmod`
 * would change its target.
 */
export async function removePath(path: string): Promise<void> {
  try {
    await fs.rm(path, { recursive: true, force: true });
  } catch (err) {
    const stats = await fs.lstat(path);
    if (
      (err as NodeJS.ErrnoException).code !== 'EACCES' ||
      !stats.isDirectory()
    ) {
      throw err;
    }
    await makeWritable(path, stats.mode);
    await fs.rm(path, { recursive: true, force: true });
  }
}

/** Removes the apt lists and logs left behind by package installs. */
export async function cleanAptFiles(dryRun = false): Promise<void> {
  await deleteAsync(
    ['/var/lib/apt/lists/**', '/var/log/dpkg.*', '/var/log/apt'],
    { dot: true, dryRun, force: true },
  );
}

/** Empties the temp folder, keeping the `containerbase` folder. */
export async function cleanTmpFiles(
  tmp: string,
  dryRun = false,
): Promise<void> {
  await deleteAsync(['**', '!containerbase/**'], {
    dot: true,
    dryRun,
    force: true,
    cwd: tmp,
  });
}

const buildKitMounts = [
  '/volumes/buildx_buildkit_',
  '/buildkit/executor/resolv.conf',
  // with `--network host`
  '/buildkit/executor/resolv-host.conf',
];

/** Whether the mounts show a buildkit build. */
async function checkDocker(): Promise<boolean> {
  try {
    const mountInfo = await readFile('/proc/self/mountinfo', {
      encoding: 'utf8',
    });
    return buildKitMounts.some((mount) => mountInfo.includes(mount));
  } catch (err) {
    logger.debug({ err }, 'failed to check docker build');
    return false;
  }
}

/** Whether the cli runs inside a docker build, checked once. */
export function isDockerBuild(): Promise<boolean> {
  return (isDocker ??= checkDocker());
}

/** Maps a tool name to a folder name, replacing `/` with `__`. */
export function tool2path(tool: string): string {
  return tool.replace(/\//g, '__');
}
