import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../../services/index.ts';
import { ElixirInstallService, ElixirPrepareService } from './elixir.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const baseUrl = 'https://github.com';
const releaseUrl = '/elixir-lang/elixir/releases/download';
const archive = 'elixir archive';

describe('cli/tools/erlang/elixir', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('ElixirPrepareService', () => {
    test('prepare', async () => {
      const { svc, child, pathSvc } = await toolContext(ElixirPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.hex'))).toBe(
        join(pathSvc.cachePath, '.hex'),
      );
      expect(await fs.readlink(join(envSvc.userHome, '.mix'))).toBe(
        join(pathSvc.cachePath, '.mix'),
      );
    });

    test('prepare keeps existing .hex and .mix links', async () => {
      const { svc, child, pathSvc } = await toolContext(ElixirPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();
      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.hex'))).toBe(
        join(pathSvc.cachePath, '.hex'),
      );
      expect(await fs.readlink(join(envSvc.userHome, '.mix'))).toBe(
        join(pathSvc.cachePath, '.mix'),
      );
    });
  });

  describe('ElixirInstallService', () => {
    test.each([
      { version: '1.13.4', file: 'Precompiled.zip', checksummed: false },
      { version: '1.14.0', file: 'elixir-otp-23.zip', checksummed: true },
      { version: '1.15.7', file: 'elixir-otp-24.zip', checksummed: true },
      { version: '1.17.3', file: 'elixir-otp-25.zip', checksummed: true },
      { version: '1.19.0', file: 'elixir-otp-26.zip', checksummed: true },
      { version: '1.20.4', file: 'elixir-otp-27.zip', checksummed: true },
    ])(
      'install $version downloads $file',
      async ({ version, file, checksummed }) => {
        const { svc, pathSvc } = await toolContext(ElixirInstallService);
        const path = `${releaseUrl}/v${version}/${file}`;
        const s = scope(baseUrl);
        if (checksummed) {
          s.get(`${path}.sha256sum`).reply(
            200,
            `${checksum(archive)}  ${file}\n`,
          );
        }
        s.get(path).reply(200, archive);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(file),
          cwd: pathSvc.versionedToolPath('elixir', version),
        });
      },
    );

    test('install: rejects a missing checksum', async () => {
      const version = '1.16.0';
      const { svc } = await toolContext(ElixirInstallService);
      const path = `${releaseUrl}/v${version}/elixir-otp-24.zip`;
      scope(baseUrl)
        .get(`${path}.sha256sum`)
        .reply(200, `${checksum('other')}  other.zip\n`);

      await expect(svc.install(version)).rejects.toThrow(
        `Checksum not found in ${baseUrl}${path}.sha256sum for elixir-otp-24.zip`,
      );
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(ElixirInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const srcDir = join(pathSvc.versionedToolPath('elixir', '1.18.3'), 'bin');

      await expect(svc.link('1.18.3')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledWith('elixir', { srcDir });
      expect(spy).toHaveBeenCalledWith('elixir', { name: 'mix', srcDir });
      expect(execaMock).toHaveBeenCalledWith(
        'mix',
        ['local.hex', '--force'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'mix',
        ['local.rebar', '--force'],
        expect.any(Object),
      );
    });

    test('link: runs mix as the configured user when root', async () => {
      vi.spyOn(EnvService.prototype, 'isRoot', 'get').mockReturnValue(true);
      const { svc } = await toolContext(ElixirInstallService);

      await expect(svc.link('1.18.3')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'su',
        ['-c', 'mix local.hex --force', 'ubuntu'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'su',
        ['-c', 'mix local.rebar --force', 'ubuntu'],
        expect.any(Object),
      );
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(ElixirInstallService);

      await expect(svc.test('1.18.3')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'elixir',
        ['--version'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'mix',
        ['--version'],
        expect.any(Object),
      );
    });
  });
});
