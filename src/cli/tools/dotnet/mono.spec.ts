import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  EnvService,
  LinkToolService,
  PathService,
} from '../../services/index.ts';
import { getDistro, logger } from '../../utils/index.ts';
import {
  MonoInstallService,
  MonoPrepareService,
  MonoVersionResolver,
} from './mono.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));
vi.mock('../../utils/index.ts', async (importActual) => ({
  ...(await importActual<typeof import('../../utils/index.ts')>()),
  getDistro: vi.fn(),
}));

const baseUrl = 'https://github.com';
const tarball = 'mono archive';

describe('cli/tools/dotnet/mono', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'home/ubuntu',
      'etc/ca-certificates/update.d',
      'usr/share',
      'opt/containerbase/bin',
      'opt/containerbase/ssl',
    ]);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    vi.mocked(getDistro).mockResolvedValue({
      name: 'Ubuntu',
      versionCode: 'jammy',
      versionId: '22.04',
    });
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('MonoInstallService', () => {
    test('install creates the cert-sync wrapper', async () => {
      const { svc, pathSvc } = await toolContext(MonoInstallService);
      const filename = 'mono-6.12.0-jammy-x86_64.tar.xz';
      const releaseUrl =
        '/containerbase/mono-prebuild/releases/download/6.12.0';
      scope(baseUrl)
        .head(`${releaseUrl}/${filename}.sha512`)
        .reply(200)
        .get(`${releaseUrl}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const path = await pathSvc.createVersionedToolPath('mono', '6.12.0');
      await fs.mkdir(join(path, 'bin'), { recursive: true });

      await expect(svc.install('6.12.0')).resolves.toBeUndefined();

      const certSync = join(path, 'bin/cert-sync');
      expect(await fs.readFile(certSync, 'utf8')).toBe(
        `#!/bin/sh\n${path}/bin/mono ${path}/lib/mono/4.5/cert-sync.exe "$@"\n`,
      );
      expect(execaMock).toHaveBeenCalledWith(
        certSync,
        ['/etc/ssl/certs/ca-certificates.crt'],
        expect.any(Object),
      );
    });

    test('install keeps an existing wrapper and cert store', async () => {
      const { svc, pathSvc } = await toolContext(MonoInstallService);
      const filename = 'mono-6.12.1-jammy-x86_64.tar.xz';
      const releaseUrl =
        '/containerbase/mono-prebuild/releases/download/6.12.1';
      scope(baseUrl)
        .head(`${releaseUrl}/${filename}.sha512`)
        .reply(200)
        .get(`${releaseUrl}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const path = await pathSvc.createVersionedToolPath('mono', '6.12.1');
      await fs.mkdir(join(path, 'bin'), { recursive: true });
      await fs.writeFile(join(path, 'bin/cert-sync'), '# existing');
      await fs.mkdir(join(pathSvc.sslPath, 'mono/new-certs/Trust'), {
        recursive: true,
      });

      await expect(svc.install('6.12.1')).resolves.toBeUndefined();

      expect(await fs.readFile(join(path, 'bin/cert-sync'), 'utf8')).toBe(
        '# existing',
      );
      expect(execaMock).not.toHaveBeenCalledWith(
        join(path, 'bin/cert-sync'),
        expect.any(Array),
        expect.any(Object),
      );

      // the prepare tests below expect a fresh cert store
      await fs.rm(join(pathSvc.sslPath, 'mono'), {
        recursive: true,
        force: true,
      });
    });

    test('link also links cert-sync', async () => {
      const { svc, pathSvc } = await toolContext(MonoInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const src = join(pathSvc.versionedToolPath('mono', '6.12.0'), 'bin');

      await expect(svc.link('6.12.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('mono', { srcDir: src });
      expect(spy).toHaveBeenCalledWith('mono', {
        srcDir: src,
        name: 'cert-sync',
      });
    });
  });

  describe('MonoPrepareService', () => {
    test('initialize and prepare', async () => {
      const { svc, child } = await toolContext(MonoPrepareService);
      const pathSvc = await child.getAsync(PathService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.mono'))).toBe(
        join(pathSvc.cachePath, '.mono'),
      );
      expect(
        await fs.readFile(
          join(
            envSvc.rootDir,
            'etc/ca-certificates/update.d/containerbase-mono-keystore',
          ),
          'utf8',
        ),
      ).toContain('Updating Mono key store');
      expect(await fs.readlink(join(envSvc.rootDir, 'usr/share/.mono'))).toBe(
        join(pathSvc.sslPath, 'mono'),
      );
    });

    test('prepare replaces an existing mono link', async () => {
      const { svc, child } = await toolContext(MonoPrepareService);
      const envSvc = await child.getAsync(EnvService);
      const tgt = join(envSvc.rootDir, 'usr/share/.mono');

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledWith(
        `Removing existing mono link at ${tgt}`,
      );
    });
  });

  describe('MonoVersionResolver', () => {
    test('resolves latest', async () => {
      scope(baseUrl)
        .get('/containerbase/mono-prebuild/releases/latest/download/version')
        .reply(200, '6.12.0');
      const { svc } = await toolContext(MonoVersionResolver);

      expect(await svc.resolve('latest')).toBe('6.12.0');
    });
  });
});
