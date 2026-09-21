import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { ComposerInstallService, ComposerVersionResolver } from './composer.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const baseUrl = 'https://github.com';
const prebuild = '/containerbase/composer-prebuild/releases/download';
const tarball = 'composer archive';

describe('cli/tools/php/composer', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  test('install', async () => {
    const { svc, pathSvc } = await toolContext(ComposerInstallService);
    const filename = 'composer-2.8.3.tar.xz';
    scope(baseUrl)
      .get(`${prebuild}/2.8.3/${filename}.sha512`)
      .reply(200, `${checksum(tarball, 'sha512')}\n`)
      .get(`${prebuild}/2.8.3/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install('2.8.3')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.toolPath('composer'),
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(ComposerInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('2.8.3')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('composer', {
      srcDir: join(pathSvc.versionedToolPath('composer', '2.8.3'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(ComposerInstallService);

    await expect(svc.test('2.8.3')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'composer',
      ['--version'],
      expect.any(Object),
    );
  });

  describe('ComposerVersionResolver', () => {
    test('resolves latest', async () => {
      scope(baseUrl)
        .get(
          '/containerbase/composer-prebuild/releases/latest/download/version',
        )
        .reply(200, '2.8.3');
      const { svc } = await toolContext(ComposerVersionResolver);

      expect(await svc.resolve('latest')).toBe('2.8.3');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(ComposerVersionResolver);

      expect(await svc.resolve('2.8.3')).toBe('2.8.3');
    });
  });
});
