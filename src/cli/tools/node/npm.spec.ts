import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PathService, VersionService } from '../../services/index.ts';
import { logger } from '../../utils/index.ts';
import {
  RenovateInstallService,
  YarnInstallService,
  YarnSlimInstallService,
} from './npm.ts';
import { testContainer } from '~test/di.ts';
import { ensurePaths, rootPath } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const nodeVersion = '22.11.0';

describe('cli/tools/node/npm', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'opt/containerbase/versions',
    ]);

    const verSvc = await (await testContainer()).getAsync(VersionService);
    await verSvc.setCurrent({
      name: 'node',
      tool: { name: 'node', version: nodeVersion },
    });
  });

  beforeEach(() => {
    // the npm install cleans up `$HOME/.npm/_logs`
    vi.stubEnv('HOME', rootPath('home/ubuntu'));
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false, all: 'ok' });
  });

  describe('RenovateInstallService', () => {
    test('install: pins the re2 mirror for old versions', async () => {
      const { svc } = await toolContext(RenovateInstallService);

      await expect(svc.install('37.0.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['install', 'renovate@37.0.0']),
        expect.objectContaining({
          env: expect.objectContaining({
            RE2_DOWNLOAD_SKIP_PATH: '1',
            RE2_DOWNLOAD_MIRROR:
              'https://github.com/containerbase/node-re2-prebuild/releases/download',
          }),
        }),
      );
    });

    test('install: no re2 mirror for recent versions', async () => {
      const { svc } = await toolContext(RenovateInstallService);

      await expect(svc.install('39.0.0')).resolves.toBeUndefined();

      expect(execaMock).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ RE2_DOWNLOAD_SKIP_PATH: '1' }),
        }),
      );
    });
  });

  describe('YarnInstallService', () => {
    test.each([
      { hostArch: 'x64', version: '4.5.3', tool: '@yarnpkg/cli-dist' },
      { hostArch: 'x64', version: '1.22.22', tool: 'yarn' },
      {
        hostArch: 'x64',
        version: '6.0.0',
        tool: '@yarnpkg/yarn-x86_64-unknown-linux-musl',
      },
      {
        hostArch: 'arm64',
        version: '6.0.1',
        tool: '@yarnpkg/yarn-aarch64-unknown-linux-musl',
      },
    ] as const)(
      'install $version uses $tool',
      async ({ hostArch, version, tool }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc } = await toolContext(YarnInstallService);

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(execaMock).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([`${tool}@${version}`]),
          expect.any(Object),
        );
        expect(logger.debug).toHaveBeenCalled();
      },
    );

    test('runs the tool test', async () => {
      const { svc } = await toolContext(YarnInstallService);

      await expect(svc.test()).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'yarn',
        ['--version'],
        expect.any(Object),
      );
    });
  });

  describe('YarnSlimInstallService', () => {
    test('install patches the yarn cli', async () => {
      const { svc, child } = await toolContext(YarnSlimInstallService);
      const pathSvc = await child.getAsync(PathService);
      const prefix = pathSvc.versionedToolPath('yarn-slim', '1.22.22');

      await expect(svc.install('1.22.22')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'sed',
        [
          '-i',
          's/ steps,/ steps.slice(0,1),/',
          `${prefix}/${nodeVersion}/node_modules/yarn/lib/cli.js`,
        ],
        expect.any(Object),
      );
      expect(await fs.readlink(join(prefix, nodeVersion, 'bin'))).toBe(
        `${join(prefix, nodeVersion)}/node_modules/.bin`,
      );
    });
  });
});
