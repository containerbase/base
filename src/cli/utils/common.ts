import fs from 'node:fs/promises';
import os from 'node:os';
import { exit } from 'node:process';
import { logger } from './logger';
import type { Distro } from './types';

let distro: undefined | Promise<Distro>;

export async function validateSystem(): Promise<void> {
  if (os.platform() !== 'linux') {
    logger.fatal(`Unsupported platform: ${os.platform()}! Please use Linux.`);
    exit(1);
  }
  if (os.arch() !== 'x64' && os.arch() !== 'arm64') {
    logger.fatal(
      `Unsupported architecture: ${os.arch()}! Please use 'x64' or 'arm64'.`
    );
    exit(1);
  }
  const d = await (distro ??= readDistro());
  switch (d.versionCode) {
    case 'focal':
    case 'jammy':
      break;
    default:
      logger.fatal(
        { distro: d },
        `Unsupported distro: ${d.versionCode}! Please use Ubuntu 'focal' or 'jammy'.`
      );
      exit(1);
  }
}

export async function getDistro(): Promise<Distro> {
  return await (distro ??= readDistro());
}

async function readDistro(): Promise<Distro> {
  const data = await fs.readFile('/etc/os-release', { encoding: 'utf-8' });
  const name = /^NAME="?(\w+)"?$/m.exec(data)?.[1];
  const versionCode = /^VERSION_CODENAME="?(\w+)"?$/m.exec(data)?.[1];
  const versionId = /^VERSION_ID="?(\d+\.\d+)"?$/m.exec(data)?.[1];
  if (!name || !versionCode || !versionId) {
    logger.error(
      { data, d: { name, versionCode, versionId } },
      `Couldn't detect distro from '/etc/os-release'.`
    );
    return { name: 'Unknown', versionCode: 'unknown', versionId: '00.00' };
  }
  logger.debug(
    { distro: { name, versionCode, versionId } },
    'discovered distro'
  );
  return { name, versionCode, versionId };
}

export const fileRights =
  fs.constants.S_IRWXU | fs.constants.S_IRWXG | fs.constants.S_IRWXO;
