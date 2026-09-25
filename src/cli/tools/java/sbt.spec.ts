import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../../services/index.ts';
import { SbtInstallService, SbtPrepareService } from './sbt.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths, rootPath } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const baseUrl = 'https://github.com';
const releaseUrl = '/sbt/sbt/releases/download';
const archive = 'sbt archive';

describe('cli/tools/java/sbt', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('SbtPrepareService', () => {
    test('prepare', async () => {
      const { svc, child, pathSvc } = await toolContext(SbtPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.sbt'))).toBe(
        join(pathSvc.cachePath, '.sbt'),
      );
      expect(
        (await fs.stat(join(pathSvc.cachePath, '.sbt'))).mode & 0o777,
      ).toBe(0o775);
    });

    test('prepare keeps an existing .sbt link', async () => {
      const { svc, child, pathSvc } = await toolContext(SbtPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();
      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.sbt'))).toBe(
        join(pathSvc.cachePath, '.sbt'),
      );
    });
  });

  describe('SbtInstallService', () => {
    test('install', async () => {
      const { svc, pathSvc } = await toolContext(SbtInstallService);
      scope(baseUrl)
        .get(`${releaseUrl}/v1.13.0/sbt-1.13.0.tgz.sha256`)
        .reply(200, `${checksum(archive)}  sbt-1.13.0.tgz\n`)
        .get(`${releaseUrl}/v1.13.0/sbt-1.13.0.tgz`)
        .reply(200, archive);
      const extract = vi
        .spyOn(CompressionService.prototype, 'extract')
        .mockImplementationOnce(async ({ cwd }) => {
          await fs.mkdir(join(cwd, 'bin'));
          for (const f of ['sbt', 'sbtn-x86_64-apple-darwin', 'sbt.bat']) {
            await fs.writeFile(join(cwd, 'bin', f), f);
          }
          await fs.writeFile(join(cwd, 'bin', 'sbtn.exe'), 'exe');
        });

      await expect(svc.install('1.13.0')).resolves.toBeUndefined();

      const path = pathSvc.versionedToolPath('sbt', '1.13.0');
      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining('sbt-1.13.0.tgz'),
        cwd: path,
        strip: 1,
      });
      expect(await fs.readdir(join(path, 'bin'))).toEqual(['sbt']);
    });

    test('install: downloads without a checksum before v1.3.5', async () => {
      const { svc, pathSvc } = await toolContext(SbtInstallService);
      scope(baseUrl)
        .get(`${releaseUrl}/v1.3.4/sbt-1.3.4.tgz`)
        .reply(200, archive);
      const extract = vi
        .spyOn(CompressionService.prototype, 'extract')
        .mockImplementationOnce(async ({ cwd }) => {
          await fs.mkdir(join(cwd, 'bin'));
          await fs.writeFile(join(cwd, 'bin', 'sbt'), 'sbt');
        });

      await expect(svc.install('1.3.4')).resolves.toBeUndefined();

      const path = pathSvc.versionedToolPath('sbt', '1.3.4');
      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining('sbt-1.3.4.tgz'),
        cwd: path,
        strip: 1,
      });
    });

    test('install: rejects an empty checksum', async () => {
      const { svc } = await toolContext(SbtInstallService);
      scope(baseUrl)
        .get(`${releaseUrl}/v1.11.0/sbt-1.11.0.tgz.sha256`)
        .reply(200, '');

      await expect(svc.install('1.11.0')).rejects.toThrow(
        `Checksum not found in ${baseUrl}${releaseUrl}/v1.11.0/sbt-1.11.0.tgz.sha256`,
      );
    });

    test('install: rejects a checksum mismatch', async () => {
      const { svc } = await toolContext(SbtInstallService);
      scope(baseUrl)
        .get(`${releaseUrl}/v1.12.0/sbt-1.12.0.tgz.sha256`)
        .reply(200, `${checksum('other')}  sbt-1.12.0.tgz\n`)
        .get(`${releaseUrl}/v1.12.0/sbt-1.12.0.tgz`)
        .times(3)
        .reply(200, archive);

      await expect(svc.install('1.12.0')).rejects.toThrow('download failed');
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(SbtInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

      await expect(svc.link('1.13.0')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledExactlyOnceWith('sbt', {
        srcDir: join(pathSvc.versionedToolPath('sbt', '1.13.0'), 'bin'),
      });
    });

    test('runs the tool test and cleans up the sbt data', async () => {
      vi.stubEnv('HOME', rootPath('home/ubuntu'));
      const { svc } = await toolContext(SbtInstallService);
      const home = rootPath('home/ubuntu/.sbt');
      await fs.mkdir(join(home, 'boot'), { recursive: true });
      await fs.mkdir(rootPath('tmp/.sbt'), { recursive: true });

      await expect(svc.test('1.13.0')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'sbt',
        ['--version'],
        expect.objectContaining({
          cwd: expect.stringContaining(rootPath('tmp/sbt-')),
        }),
      );
      expect(await fs.readdir(home)).toEqual([]);
      await expect(fs.stat(rootPath('tmp/.sbt'))).rejects.toThrow();
    });

    test('runs the tool test without sbt data', async () => {
      vi.stubEnv('HOME', rootPath('home/none'));
      const { svc } = await toolContext(SbtInstallService);

      await expect(svc.test('1.13.0')).resolves.toBeUndefined();
    });
  });
});
