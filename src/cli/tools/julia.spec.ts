import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../services/index.ts';
import { JuliaInstallService, JuliaPrepareService } from './julia.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://julialang-s3.julialang.org';
const archive = 'julia archive';

describe('cli/tools/julia', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('JuliaPrepareService', () => {
    test('prepare', async () => {
      const { svc, child, pathSvc } = await toolContext(JuliaPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.julia'))).toBe(
        join(pathSvc.cachePath, '.julia'),
      );
    });

    test('prepare keeps an existing .julia link', async () => {
      const { svc, child, pathSvc } = await toolContext(JuliaPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();
      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.julia'))).toBe(
        join(pathSvc.cachePath, '.julia'),
      );
    });
  });

  describe('JuliaInstallService', () => {
    test.each([
      { hostArch: 'x64', dir: 'x64', fileArch: 'x86_64' },
      { hostArch: 'arm64', dir: 'aarch64', fileArch: 'aarch64' },
    ] as const)('install on $fileArch', async ({ hostArch, dir, fileArch }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const path = (d: string, a: string): string =>
        `/bin/linux/${d}/1.13/julia-1.13.3-linux-${a}.tar.gz`;
      mockToolFiles([
        toolFile(`${baseUrl}${path('x64', 'x86_64')}`, archive, 'amd64'),
        toolFile(`${baseUrl}${path('aarch64', 'aarch64')}`, archive, 'arm64'),
      ]);
      scope(baseUrl).get(path(dir, fileArch)).reply(200, archive);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');
      const { svc, pathSvc } = await toolContext(JuliaInstallService);

      await expect(svc.install('1.13.3')).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(`julia-1.13.3-linux-${fileArch}.tar.gz`),
        cwd: pathSvc.versionedToolPath('julia', '1.13.3'),
        strip: 1,
      });
    });

    test('install: rejects without a tool-versions file', async () => {
      const { svc } = await toolContext(JuliaInstallService);

      await expect(svc.install('1.13.3')).rejects.toThrow(
        'There is no tool-versions file for julia 1.13.3 on this host',
      );
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(JuliaInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('1.13.3')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('julia', {
        srcDir: join(pathSvc.versionedToolPath('julia', '1.13.3'), 'bin'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(JuliaInstallService);

      await expect(svc.test('1.13.3')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'julia',
        ['--version'],
        expect.any(Object),
      );
    });
  });
});
