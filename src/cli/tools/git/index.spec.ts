import { readFile } from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { getDistro, logger } from '../../utils/index.ts';
import { GitInstallService, GitPrepareService } from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths, rootPath } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('../../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

describe('cli/tools/git/index', () => {
  beforeAll(async () => {
    // `etc/apt/sources.list.d` ships with the image
    await ensurePaths([
      'tmp',
      'etc/apt/sources.list.d',
      'opt/containerbase/bin',
    ]);
  });

  beforeEach(() => {
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'noble',
      versionId: '24.04',
    });
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({
      failed: false,
      stdout: 'git version 2.55.0',
    });
  });

  describe('GitPrepareService', () => {
    test('adds the ppa', async () => {
      const { svc } = await toolContext(GitPrepareService);
      scope('http://keyserver.ubuntu.com')
        .get('/pks/lookup')
        .query(true)
        .reply(200, 'public key');

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await readFile(rootPath('etc/apt/keyrings/git.asc'), 'utf8')).toBe(
        'public key',
      );
      expect(
        await readFile(rootPath('etc/apt/sources.list.d/git.sources'), 'utf8'),
      ).toBe(
        `Types: deb
URIs: https://ppa.launchpadcontent.net/git-core/ppa/ubuntu
Suites: noble
Components: main
Architectures: amd64
Signed-By: /etc/apt/keyrings/git.asc`,
      );
    });
  });

  describe('GitInstallService', () => {
    test('install', async () => {
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.install('2.55.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith('apt-get', [
        '-qq',
        'install',
        '-y',
        'git',
      ]);
      expect(logger.debug).toHaveBeenCalledWith(
        { version: '2.55.0' },
        'installed git version',
      );
    });

    test('install: rejects a version below the minimum', async () => {
      const { svc } = await toolContext(GitInstallService);
      execaMock.mockResolvedValue({
        failed: false,
        stdout: 'git version 2.32.0',
      });

      await expect(svc.install('2.32.0')).rejects.toThrow(
        'Git version mismatch! Expected: 2.33.0, got: 2.32.0',
      );
    });

    test('link does nothing', async () => {
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.link('2.55.0')).resolves.toBeUndefined();
    });

    test('allows all safe directories', async () => {
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.postInstall('2.55.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'git',
        ['config', '--system', 'safe.directory', '*'],
        expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
      );
    });

    test('prints the version', async () => {
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.test('2.55.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'git',
        ['--version'],
        expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
      );
    });

    test('uninstall', async () => {
      const { svc } = await toolContext(GitInstallService);

      await expect(svc.uninstall('2.55.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith('apt-get', [
        '-qq',
        'remove',
        '-y',
        'git',
      ]);
    });
  });
});
