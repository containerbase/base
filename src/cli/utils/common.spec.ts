import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  cleanAptFiles,
  cleanTmpFiles,
  getDistro,
  isDockerBuild,
  parseBinaryName,
  pathExists,
  reset,
  tool2path,
  validateSystem,
} from '.';
import { rootPath } from '~test/path';

const osMocks = vi.hoisted(() => ({
  platform: vi.fn(),
  arch: vi.fn(),
}));
const fsMocks = vi.hoisted(() => ({ readFile: vi.fn(), stat: vi.fn() }));
const procMocks = vi.hoisted(() => ({ exit: vi.fn(), env: {}, argv0: 'node' }));

vi.mock('node:fs/promises', async (importActual) => {
  const origFs = await importActual<any>();
  return {
    ...fsMocks,
    default: { ...origFs, ...fsMocks },
  };
});
vi.mock('node:os', () => ({ ...osMocks, default: osMocks }));
vi.mock('node:process', () => ({ ...procMocks, default: procMocks }));
vi.mock('del');

describe('common', () => {
  beforeEach(() => {
    reset();
    fsMocks.readFile.mockResolvedValueOnce(`PRETTY_NAME="Ubuntu 22.04.2 LTS"
NAME="Ubuntu"
VERSION_ID="22.04"
VERSION="22.04.2 LTS (Jammy Jellyfish)"
VERSION_CODENAME=jammy
ID=ubuntu
ID_LIKE=debian
HOME_URL="https://www.ubuntu.com/"
SUPPORT_URL="https://help.ubuntu.com/"
BUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"
PRIVACY_POLICY_URL="https://www.ubuntu.com/legal/terms-and-policies/privacy-policy"
UBUNTU_CODENAME=jammy`);
  });

  describe('validateSystem', () => {
    test('invalid platform', async () => {
      procMocks.exit.mockImplementation(() => {
        throw new Error();
      });
      await expect(validateSystem()).rejects.toThrow();
      osMocks.platform.mockReturnValue('linux');
      await expect(validateSystem()).rejects.toThrow();
      osMocks.arch.mockReturnValue('x64');

      await expect(validateSystem()).resolves.toBeUndefined();

      reset();
      await expect(validateSystem()).rejects.toThrow();

      expect(fsMocks.readFile).toHaveBeenCalledWith('/etc/os-release', {
        encoding: 'utf-8',
      });
    });
  });

  test('reads distro', async () => {
    expect(await getDistro()).toEqual({
      name: 'Ubuntu',
      versionCode: 'jammy',
      versionId: '22.04',
    });
    reset();
    expect(await getDistro()).toEqual({
      name: 'Unknown',
      versionCode: 'unknown',
      versionId: '00.00',
    });
    expect(fsMocks.readFile).toHaveBeenCalledWith('/etc/os-release', {
      encoding: 'utf-8',
    });
  });

  test('pathExists', async () => {
    fsMocks.stat.mockResolvedValueOnce({});
    expect(await pathExists('/etc/os-release')).toBe(true);
    expect(await pathExists('/etc/os-release')).toBe(false);
    fsMocks.stat.mockResolvedValueOnce({ isFile: () => true });
    expect(await pathExists('/etc/os-release', 'file')).toBe(true);
    expect(await pathExists('/etc/os-release', 'file')).toBe(false);
    fsMocks.stat.mockResolvedValueOnce({ isDirectory: () => true });
    expect(await pathExists('/etc/os-release', 'dir')).toBe(true);
    fsMocks.stat.mockResolvedValueOnce({ isSymbolicLink: () => true });
    expect(await pathExists('/etc/os-release', 'symlink')).toBe(true);
    expect(await pathExists('/etc/os-release', 'symlink')).toBe(false);
  });

  test('parseBinaryName', () => {
    expect(parseBinaryName(null, 'node', 'app')).toBe('node app');
    expect(parseBinaryName('containerbase-cli', 'node', 'app')).toBe(
      'containerbase-cli',
    );
  });

  test('cleanAptFiles', async () => {
    await expect(cleanAptFiles(true)).resolves.toBeUndefined();
  });

  test('cleanTmpFiles', async () => {
    await expect(cleanTmpFiles(rootPath('tmp'), true)).resolves.toBeUndefined();
  });

  describe('isDockerBuild', () => {
    beforeEach(() => {
      fsMocks.readFile.mockRestore();
    });

    test('cgroup v1', async () => {
      fsMocks.readFile.mockResolvedValueOnce(
        '2279 2272 8:64 /version-pack-data/community/docker/volumes/buildx_buildkit_renovatebot-builder0_state/_data/runc-overlayfs/executor/resolv.conf' +
          '/etc/resolv.conf ro,nosuid,nodev,noexec,relatime master:346 - ext4 /dev/sde rw,discard,errors=remount-ro,data=ordered\n',
      );
      expect(await isDockerBuild()).toBe(true);
      expect(await isDockerBuild()).toBe(true);
    });

    test('cgroup v2', async () => {
      fsMocks.readFile.mockResolvedValueOnce(
        '4854 4821 0:37 /docker-lib/buildkit/executor/resolv.conf /etc/resolv.conf ro,nosuid,nodev,noexec,relatime master:63 - btrfs /dev/sdb rw,compress=zlib:3,space_cache,subvolid=332,subvol=/docker-lib\n',
      );
      expect(await isDockerBuild()).toBe(true);
    });

    test('catches errors', async () => {
      fsMocks.readFile.mockRejectedValueOnce(new Error());
      expect(await isDockerBuild()).toBe(false);
    });
  });

  test('tool2path', () => {
    expect(tool2path('@microsoft/rush//path')).toBe('@microsoft__rush____path');
  });
});
