import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../services/index.ts';
import { getDistro } from '../utils/index.ts';
import { SwiftInstallService, SwiftPrepareService } from './swift.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const baseUrl = 'https://download.swift.org';
const archive = 'swift archive';

describe('cli/tools/swift', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // CI configures an apt proxy, which `AptService` would write to `/etc`
    vi.stubEnv('APT_HTTP_PROXY', undefined);
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('SwiftPrepareService', () => {
    test.each([
      {
        code: 'jammy',
        pkgs: ['libgcc-9-dev', 'libpython3.8', 'libstdc++-9-dev'],
      },
      {
        code: 'noble',
        pkgs: ['libgcc-9-dev', 'libncurses6', 'libpython3.8'],
      },
      {
        code: 'resolute',
        pkgs: ['libgcc-11-dev', 'libncurses6', 'libpython3.14'],
      },
    ])('prepare on $code', async ({ code, pkgs }) => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: code,
        versionId: '24.04',
      });
      const { svc, child, pathSvc } = await toolContext(SwiftPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'apt-get',
        expect.arrayContaining(['binutils', 'gnupg2', ...pkgs]),
        { env: { DEBIAN_FRONTEND: 'noninteractive' } },
      );
      expect(await fs.readlink(join(envSvc.userHome, '.swiftpm'))).toBe(
        join(pathSvc.cachePath, '.swiftpm'),
      );
    });

    test('prepare: throws on an unsupported distro', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'focal',
        versionId: '20.04',
      });
      const { svc } = await toolContext(SwiftPrepareService);

      await expect(svc.prepare()).rejects.toThrow(
        "Tool 'swift' not supported on: focal!",
      );
    });

    test('prepare keeps an existing .swiftpm link', async () => {
      vi.mocked(getDistro).mockResolvedValue({
        name: 'Ubuntu',
        versionCode: 'noble',
        versionId: '24.04',
      });
      const { svc, child, pathSvc } = await toolContext(SwiftPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();
      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.swiftpm'))).toBe(
        join(pathSvc.cachePath, '.swiftpm'),
      );
    });
  });

  describe('SwiftInstallService', () => {
    test.each([
      {
        hostArch: 'x64',
        versionId: '22.04',
        version: '5.9.2',
        platform: 'ubuntu22.04',
        releaseVersion: '5.9.2',
      },
      {
        hostArch: 'arm64',
        versionId: '22.04',
        version: '5.9.2',
        platform: 'ubuntu22.04-aarch64',
        releaseVersion: '5.9.2',
      },
      {
        hostArch: 'x64',
        versionId: '24.04',
        version: '5.9.3',
        platform: 'ubuntu22.04',
        releaseVersion: '5.9.3',
      },
      {
        hostArch: 'x64',
        versionId: '25.10',
        version: '5.9.2',
        platform: 'ubuntu25.10',
        releaseVersion: '5.9.2',
      },
      {
        hostArch: 'x64',
        versionId: '22.04',
        version: '5.7.0',
        platform: 'ubuntu22.04',
        releaseVersion: '5.7',
      },
    ] as const)(
      'install $version on $platform ($versionId)',
      async ({ hostArch, versionId, version, platform, releaseVersion }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        vi.mocked(getDistro).mockResolvedValue({
          name: 'Ubuntu',
          versionCode: 'noble',
          versionId,
        });
        const { svc, pathSvc } = await toolContext(SwiftInstallService);
        const webDir = `/swift-${releaseVersion}-release/${platform.replace(/\./g, '')}`;
        const release = `swift-${releaseVersion}-RELEASE`;
        const filename = `${release}-${platform}.tar.gz`;
        scope(baseUrl)
          .get(`${webDir}/${release}/${filename}`)
          .reply(200, archive);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(filename),
          cwd: pathSvc.versionedToolPath('swift', version),
          strip: 2,
        });
      },
    );

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(SwiftInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('5.9.2')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('swift', {
        srcDir: join(pathSvc.versionedToolPath('swift', '5.9.2'), 'bin'),
      });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(SwiftInstallService);

      await expect(svc.test('5.9.2')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'swift',
        ['--version'],
        expect.any(Object),
      );
    });
  });
});
