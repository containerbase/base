import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  fileExists,
  getDistro,
  parseBinaryName,
  resetDistro,
  validateSystem,
} from '.';

const osMocks = vi.hoisted(() => ({
  platform: vi.fn(),
  arch: vi.fn(),
}));
const fsMocks = vi.hoisted(() => ({ readFile: vi.fn(), stat: vi.fn() }));
const procMocks = vi.hoisted(() => ({ exit: vi.fn(), env: {}, argv0: 'node' }));

vi.mock('node:fs/promises', async () => {
  const origFs = await vi.importActual<any>('node:fs/promises');
  return {
    ...fsMocks,
    default: { ...origFs, ...fsMocks },
  };
});
vi.mock('node:os', () => ({ ...osMocks, default: osMocks }));
vi.mock('node:process', () => ({ ...procMocks, default: procMocks }));

describe('common', () => {
  beforeEach(() => {
    resetDistro();
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

      resetDistro();
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
    resetDistro();
    expect(await getDistro()).toEqual({
      name: 'Unknown',
      versionCode: 'unknown',
      versionId: '00.00',
    });
    expect(fsMocks.readFile).toHaveBeenCalledWith('/etc/os-release', {
      encoding: 'utf-8',
    });
  });

  test('fileExists', async () => {
    fsMocks.stat.mockResolvedValueOnce({ isFile: () => true });
    expect(await fileExists('/etc/os-release')).toBe(true);
    expect(await fileExists('/etc/os-release')).toBe(false);
  });

  test('parseBinaryName', () => {
    expect(parseBinaryName(null, 'node', 'app')).toBe('node app');
    expect(parseBinaryName('containerbase-cli', 'node', 'app')).toBe(
      'containerbase-cli',
    );
  });
});
