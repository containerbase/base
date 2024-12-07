import fs, { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { argv0, exit } from 'node:process';
import { deleteAsync } from 'del';
import { logger } from './logger';
import type { CliMode, Distro } from './types';

let distro: undefined | Promise<Distro>;
let isDocker: undefined | Promise<boolean>;

export async function validateSystem(): Promise<void> {
  if (os.platform() !== 'linux') {
    logger.fatal(`Unsupported platform: ${os.platform()}! Please use Linux.`);
    exit(1);
  }
  if (os.arch() !== 'x64' && os.arch() !== 'arm64') {
    logger.fatal(
      `Unsupported architecture: ${os.arch()}! Please use 'x64' or 'arm64'.`,
    );
    exit(1);
  }
  const d = await (distro ??= readDistro());
  switch (d.versionCode) {
    case 'focal':
    case 'jammy':
    case 'noble':
      break;
    default:
      logger.fatal(
        { distro: d },
        `Unsupported distro: ${d.versionCode}! Please use Ubuntu 'focal', 'jammy' or 'noble'.`,
      );
      exit(1);
  }
}

export async function getDistro(): Promise<Distro> {
  return await (distro ??= readDistro());
}

/**
 * For testing purposes only.
 * @private
 * @internal
 */
/* c8 ignore next 3 */
export function reset(): void {
  distro = undefined;
  isDocker = undefined;
}

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

export type PathType = 'file' | 'dir' | 'symlink';

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
    }
    return !!fstat;
  } catch {
    return false;
  }
}

export function parseBinaryName(
  mode: CliMode | null,
  node: string,
  app: string,
): string | undefined {
  if (mode) {
    return mode;
  }

  return argv0.endsWith('/node') || argv0 === 'node' ? `${node} ${app}` : argv0;
}

export async function cleanAptFiles(dryRun = false): Promise<void> {
  await deleteAsync(
    ['/var/lib/apt/lists/**', '/var/log/dpkg.*', '/var/log/apt'],
    { dot: true, dryRun, force: true },
  );
}

export async function cleanTmpFiles(
  tmp: string,
  dryRun = false,
): Promise<void> {
  await deleteAsync([`**`, `!containerbase/**`], {
    dot: true,
    dryRun,
    force: true,
    cwd: tmp,
  });
}

const buildKitMounts = [
  '/volumes/buildx_buildkit_',
  '/buildkit/executor/resolv.conf',
];

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

export function isDockerBuild(): Promise<boolean> {
  return (isDocker ??= checkDocker());
}

export function tool2path(tool: string): string {
  return tool.replace(/\//g, '__');
}
