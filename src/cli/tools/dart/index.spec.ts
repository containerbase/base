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
import { DartInstallService, DartPrepareService } from './index.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://storage.googleapis.com';
const zip = 'dart sdk';

describe('cli/tools/dart/index', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'root', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('DartInstallService', () => {
    test.each([
      { hostArch: 'x64', toolArch: 'x64', version: '3.5.0' },
      { hostArch: 'arm64', toolArch: 'arm64', version: '3.5.1' },
    ] as const)(
      'install on $toolArch',
      async ({ hostArch, toolArch, version }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc, pathSvc } = await toolContext(DartInstallService);
        const sdkFile = `dartsdk-linux-${toolArch}-release.zip`;
        const sdkUrl = `/dart-archive/channels/stable/release/${version}/sdk`;
        scope(baseUrl)
          .get(`${sdkUrl}/${sdkFile}.sha256sum`)
          .reply(200, `${checksum(zip)} ${sdkFile}\n`)
          .get(`${sdkUrl}/${sdkFile}`)
          .reply(200, zip);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(sdkFile),
          cwd: pathSvc.versionedToolPath('dart', version),
          strip: 1,
        });
      },
    );

    test('install: rejects v1', async () => {
      const { svc } = await toolContext(DartInstallService);

      await expect(svc.install('1.11.0')).rejects.toThrow(
        'Dart SDK version < v2 is not supported: 1.11.0',
      );
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(DartInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('3.5.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('dart', {
        srcDir: join(pathSvc.versionedToolPath('dart', '3.5.0'), 'bin'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(DartInstallService);

      await expect(svc.test('3.5.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'dart',
        ['--version'],
        expect.any(Object),
      );
    });
  });

  describe('DartPrepareService', () => {
    test('initialize and prepare', async () => {
      const { svc, child } = await toolContext(DartPrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.initialize()).resolves.toBeUndefined();
      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.dart'))).toBe(
        join(pathSvc.cachePath, '.dart'),
      );
      expect(await fs.readlink(join(envSvc.userHome, '.pub-cache'))).toBe(
        join(pathSvc.cachePath, '.pub-cache'),
      );
    });
  });
});
