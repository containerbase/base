import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { GradleInstallService, GradleVersionResolver } from './gradle.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const baseUrl = 'https://services.gradle.org';
const zip = 'gradle archive';

describe('cli/tools/java/gradle', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  test('install', async () => {
    const { svc, pathSvc } = await toolContext(GradleInstallService);
    const filename = 'gradle-8.10.2-bin.zip';
    scope(baseUrl)
      .get(`/distributions/${filename}.sha256`)
      .reply(200, `${checksum(zip)}\n`)
      .get(`/distributions/${filename}`)
      .reply(200, zip);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install('8.10.2')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('gradle', '8.10.2'),
      strip: 1,
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(GradleInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('8.10.2')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('gradle', {
      srcDir: join(pathSvc.versionedToolPath('gradle', '8.10.2'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(GradleInstallService);

    await expect(svc.test('8.10.2')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'gradle',
      ['--version'],
      expect.any(Object),
    );
  });

  test('validate coerces the two part versions', async () => {
    const { svc } = await toolContext(GradleInstallService);

    expect(await svc.validate('8.10')).toBe(true);
    expect(await svc.validate('not-a-version')).toBe(false);
  });

  describe('GradleVersionResolver', () => {
    test.each([{ version: undefined }, { version: '' }, { version: 'latest' }])(
      'resolves $version',
      async ({ version }) => {
        scope(baseUrl)
          .get('/versions/current')
          .reply(200, { version: '8.10.2' });
        const { svc } = await toolContext(GradleVersionResolver);

        expect(await svc.resolve(version)).toBe('8.10.2');
      },
    );

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(GradleVersionResolver);

      expect(await svc.resolve('8.10.2')).toBe('8.10.2');
    });
  });
});
