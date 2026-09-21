import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
  PathService,
} from '../../services/index.ts';
import { DockerInstallService, DockerPrepareService } from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://download.docker.com';

describe('cli/tools/docker/index', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('DockerInstallService', () => {
    test.each([
      { hostArch: 'x64', toolArch: 'x86_64', version: '27.3.1' },
      { hostArch: 'arm64', toolArch: 'aarch64', version: '27.3.2' },
    ] as const)(
      'install on $toolArch',
      async ({ hostArch, toolArch, version }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc, pathSvc } = await toolContext(DockerInstallService);
        scope(baseUrl)
          .get(`/linux/static/stable/${toolArch}/docker-${version}.tgz`)
          .reply(200, 'docker archive');
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`docker-${version}.tgz`),
          cwd: join(pathSvc.versionedToolPath('docker', version), 'bin'),
          strip: 1,
          files: ['docker/docker'],
        });
      },
    );

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(DockerInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('27.3.1')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('docker', {
        srcDir: join(pathSvc.versionedToolPath('docker', '27.3.1'), 'bin'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(DockerInstallService);

      await expect(svc.test('27.3.1')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'docker',
        ['--version'],
        expect.any(Object),
      );
    });
  });

  describe('DockerPrepareService', () => {
    test('initialize and prepare', async () => {
      const { svc, child } = await toolContext(DockerPrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.initialize()).resolves.toBeUndefined();
      expect(
        (
          await fs.stat(join(pathSvc.cachePath, '.docker', 'cli-plugins'))
        ).isDirectory(),
      ).toBe(true);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'groupadd',
        ['-g', '999', 'docker'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'usermod',
        ['-aG', 'docker', 'ubuntu'],
        expect.any(Object),
      );
      expect(await fs.readlink(join(envSvc.userHome, '.docker'))).toBe(
        join(pathSvc.cachePath, '.docker'),
      );
      expect(
        await fs.readlink(
          join(envSvc.rootDir, 'usr/local/lib/docker', 'cli-plugins'),
        ),
      ).toBe(join(pathSvc.cachePath, '.docker', 'cli-plugins'));
    });
  });
});
