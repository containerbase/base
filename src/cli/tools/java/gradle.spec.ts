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

    test.each(['8.10.2', '8.8-rc-2', '8.10.2.1'])(
      'keeps %s without a lookup',
      async (version) => {
        const { svc } = await toolContext(GradleVersionResolver);

        expect(await svc.resolve(version)).toBe(version);
      },
    );

    describe('partial versions', () => {
      /** A stable release entry of the versions list. */
      const release = (version: string): Record<string, unknown> => ({
        version,
        snapshot: false,
        nightly: false,
        releaseNightly: false,
        activeRc: false,
        rcFor: '',
        milestoneFor: '',
        broken: false,
      });
      const versions = [
        { ...release('9.1.0-20260101000000+0000'), snapshot: true },
        { ...release('9.1-20260101000000+0000'), nightly: true },
        { ...release('9.1-20260102000000+0000'), releaseNightly: true },
        { ...release('9.1-rc-1'), rcFor: '9.1', activeRc: true },
        { ...release('9.0-milestone-1'), milestoneFor: '9.0' },
        { ...release('8.99'), broken: true },
        { ...release('8.8-rc-2'), rcFor: '8.8' },
        // an entry in an unexpected shape is skipped
        { ...release('8.11'), broken: 'yes' },
        release('9.0.1'),
        release('9.0.0'),
        release('8.10.2'),
        release('8.10.1'),
        release('8.10'),
        release('8.9'),
        release('80.1'),
        release('6.9'),
        release('6.9.4'),
        { version: '7.6.1' },
      ];

      test.each([
        { version: '8', expected: '8.10.2' },
        { version: '9', expected: '9.0.1' },
        { version: '9.0', expected: '9.0.1' },
        { version: '8.10', expected: '8.10' },
        { version: '8.9', expected: '8.9' },
        { version: '6.9', expected: '6.9' },
        // a listed release is kept even when gradle marks it as broken
        { version: '8.99', expected: '8.99' },
        { version: '7', expected: '7.6.1' },
        { version: '80', expected: '80.1' },
      ])('resolves $version to $expected', async ({ version, expected }) => {
        scope(baseUrl).get('/versions/all').reply(200, versions);
        const { svc } = await toolContext(GradleVersionResolver);

        expect(await svc.resolve(version)).toBe(expected);
      });

      test.each(['10', '9.1', '5', '8.1'])(
        'throws for %s without a matching release',
        async (version) => {
          scope(baseUrl).get('/versions/all').reply(200, versions);
          const { svc } = await toolContext(GradleVersionResolver);

          await expect(svc.resolve(version)).rejects.toThrow(
            `No gradle release found for version ${version}`,
          );
        },
      );

      test('keeps a partial version when the lookup fails', async () => {
        scope(baseUrl).get('/versions/all').times(3).replyWithError('reset');
        const { svc } = await toolContext(GradleVersionResolver);

        expect(await svc.resolve('8.10')).toBe('8.10');
      });

      test.each([
        // an invalid body is retried
        { name: 'invalid json', body: 'not json', times: 3 },
        { name: 'an unexpected document', body: { versions: [] }, times: 1 },
      ])('keeps a partial version for $name', async ({ body, times }) => {
        scope(baseUrl).get('/versions/all').times(times).reply(200, body);
        const { svc } = await toolContext(GradleVersionResolver);

        expect(await svc.resolve('8')).toBe('8');
      });
    });
  });
});
