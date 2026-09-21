import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
  PathService,
} from '../services/index.ts';
import { FlutterInstallService, FlutterPrepareService } from './flutter.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';
const tarball = 'flutter archive';

describe('cli/tools/flutter', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'root', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('FlutterInstallService', () => {
    test.each([
      { hostArch: 'x64', ghArch: 'x86_64', version: '3.24.0' },
      { hostArch: 'arm64', ghArch: 'aarch64', version: '3.24.1' },
    ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(FlutterInstallService);
      const filename = `flutter-${version}-${ghArch}.tar.xz`;
      const releaseUrl = `/containerbase/flutter-prebuild/releases/download/${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: pathSvc.toolPath('flutter'),
      });
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(FlutterInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('3.24.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('flutter', {
        srcDir: join(pathSvc.versionedToolPath('flutter', '3.24.0'), 'bin'),
        args: '--no-version-check',
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(FlutterInstallService);

      await expect(svc.test('3.24.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'flutter',
        ['--version'],
        expect.any(Object),
      );
    });
  });

  describe('FlutterPrepareService', () => {
    test('initialize and prepare', async () => {
      const { svc, child } = await toolContext(FlutterPrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.initialize()).resolves.toBeUndefined();

      expect(
        await fs.readFile(join(pathSvc.cachePath, '.flutter'), 'utf8'),
      ).toBe('{ "firstRun": false, "enabled": false }\n');
      expect(
        await fs.readFile(
          join(pathSvc.cachePath, '.flutter_tool_state'),
          'utf8',
        ),
      ).toBe('{ "is-bot": false, "redisplay-welcome-message": false }\n');

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(
        await fs.readFile(join(envSvc.rootDir, 'root', '.flutter'), 'utf8'),
      ).toBe('{ "firstRun": false, "enabled": false }');
      expect(await fs.readlink(join(envSvc.userHome, '.flutter'))).toBe(
        join(pathSvc.cachePath, '.flutter'),
      );
      expect(
        await fs.readlink(join(envSvc.userHome, '.flutter_tool_state')),
      ).toBe(join(pathSvc.cachePath, '.flutter_tool_state'));
    });
  });
});
