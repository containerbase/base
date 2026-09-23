import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CompressionService,
  EnvService,
  LinkToolService,
} from '../services/index.ts';
import { RustInstallService, RustPrepareService } from './rust.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://static.rust-lang.org';
const archive = 'rust archive';

describe('cli/tools/rust', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'home/ubuntu', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  describe('RustPrepareService', () => {
    test('prepare', async () => {
      const { svc, child, pathSvc } = await toolContext(RustPrepareService);
      const envSvc = await child.getAsync(EnvService);

      await expect(svc.prepare()).resolves.toBeUndefined();

      expect(await fs.readlink(join(envSvc.userHome, '.cargo'))).toBe(
        join(pathSvc.cachePath, '.cargo'),
      );
    });
  });

  describe('RustInstallService', () => {
    test.each([
      {
        hostArch: 'x64',
        version: '1.98.1',
        file: '/dist/rust-1.98.1-x86_64-unknown-linux-gnu.tar',
        target: 'x86_64-unknown-linux-gnu',
        ext: 'xz',
      },
      {
        hostArch: 'arm64',
        version: 'nightly-2026-06-19',
        file: '/dist/2026-06-19/rust-nightly-aarch64-unknown-linux-gnu.tar',
        target: 'aarch64-unknown-linux-gnu',
        ext: 'gz',
      },
    ] as const)(
      'install $version on $target',
      async ({ hostArch, version, file, target, ext }) => {
        vi.mocked(arch).mockReturnValue(hostArch);
        const { svc, pathSvc } = await toolContext(RustInstallService);
        scope(baseUrl)
          .head(`${file}.xz.sha256`)
          .reply(ext === 'xz' ? 200 : 404)
          .get(`${file}.${ext}.sha256`)
          .reply(200, `${checksum(archive)}  rust.tar.${ext}\n`)
          .get(`${file}.${ext}`)
          .reply(200, archive);
        const extract = vi.spyOn(CompressionService.prototype, 'extract');

        await expect(svc.install(version)).resolves.toBeUndefined();

        expect(extract).toHaveBeenCalledExactlyOnceWith({
          file: expect.stringContaining(`.tar.${ext}`),
          cwd: expect.any(String),
          strip: 1,
        });
        expect(execaMock).toHaveBeenCalledWith(
          expect.stringMatching(/\/install\.sh$/),
          [
            `--prefix=${pathSvc.versionedToolPath('rust', version)}`,
            `--components=cargo,rust-std-${target},rustc`,
          ],
          expect.any(Object),
        );
      },
    );

    test('install: rejects an empty checksum', async () => {
      const { svc } = await toolContext(RustInstallService);
      const file = '/dist/rust-1.97.0-x86_64-unknown-linux-gnu.tar.xz';
      scope(baseUrl)
        .head(`${file}.sha256`)
        .reply(200)
        .get(`${file}.sha256`)
        .reply(200, '');

      await expect(svc.install('1.97.0')).rejects.toThrow('not found');
    });

    test('install: rejects a checksum mismatch', async () => {
      const { svc } = await toolContext(RustInstallService);
      const file = '/dist/rust-1.98.0-x86_64-unknown-linux-gnu.tar.xz';
      scope(baseUrl)
        .head(`${file}.sha256`)
        .reply(200)
        .get(`${file}.sha256`)
        .reply(200, `${checksum('other')}  rust.tar.xz\n`)
        .get(file)
        .times(3)
        .reply(200, archive);

      await expect(svc.install('1.98.0')).rejects.toThrow('download failed');
    });

    test('link', async () => {
      const { svc, pathSvc } = await toolContext(RustInstallService);
      const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
      const srcDir = join(pathSvc.versionedToolPath('rust', '1.98.1'), 'bin');

      await expect(svc.link('1.98.1')).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('rust', { name: 'cargo', srcDir });
      expect(spy).toHaveBeenCalledWith('rust', { name: 'rustc', srcDir });
    });

    test('runs the tool test', async () => {
      const { svc } = await toolContext(RustInstallService);

      await expect(svc.test('1.98.1')).resolves.toBeUndefined();

      expect(execaMock).toHaveBeenCalledWith(
        'cargo',
        ['--version'],
        expect.any(Object),
      );
      expect(execaMock).toHaveBeenCalledWith(
        'rustc',
        ['--version'],
        expect.any(Object),
      );
    });

    test.each([
      { version: '1.98.1', valid: true },
      { version: 'beta', valid: true },
      { version: 'nightly', valid: true },
      { version: 'nightly-2026-06-19', valid: true },
      { version: 'stable', valid: false },
    ])('validates $version', async ({ version, valid }) => {
      const { svc } = await toolContext(RustInstallService);

      await expect(svc.validate(version)).resolves.toBe(valid);
    });
  });
});
