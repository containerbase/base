import fs from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../../services/index.ts';
import { NugetInstallService, NugetVersionResolver } from './nuget.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const baseUrl = 'https://dist.nuget.org';

describe('cli/tools/dotnet/nuget', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  test('install', async () => {
    const { svc, pathSvc } = await toolContext(NugetInstallService);
    scope(baseUrl)
      .get('/win-x86-commandline/v6.11.1/nuget.exe')
      .reply(200, 'nuget binary');

    await expect(svc.install('6.11.1')).resolves.toBeUndefined();

    const bin = join(pathSvc.versionedToolPath('nuget', '6.11.1'), 'bin');
    expect(await fs.readFile(join(bin, 'nuget.exe'), 'utf8')).toBe(
      'nuget binary',
    );
    expect(await fs.readFile(join(bin, 'nuget'), 'utf8')).toBe(
      `#!/bin/sh\nexec mono "${join(bin, 'nuget.exe')}" "$@"\n`,
    );
    expect((await fs.stat(join(bin, 'nuget'))).mode & 0o777).toBe(0o775);
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(NugetInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('6.11.1')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('nuget', {
      srcDir: join(pathSvc.versionedToolPath('nuget', '6.11.1'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(NugetInstallService);

    await expect(svc.test('6.11.1')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'nuget',
      ['help'],
      expect.any(Object),
    );
  });

  describe('NugetVersionResolver', () => {
    test.each([{ version: undefined }, { version: '' }, { version: 'latest' }])(
      'resolves $version to the latest blessed release',
      async ({ version }) => {
        scope(baseUrl)
          .get('/tools.json')
          .reply(200, {
            'nuget.exe': [
              { version: '6.12.0', stage: 'EarlyAccessPreview' },
              { version: '6.11.1', stage: 'ReleasedAndBlessed' },
            ],
          });
        const { svc } = await toolContext(NugetVersionResolver);

        expect(await svc.resolve(version)).toBe('6.11.1');
      },
    );

    describe('partial versions', () => {
      const tools = {
        'nuget.exe': [
          { version: '7.0.0', stage: 'EarlyAccessPreview' },
          { version: '6.12.0', stage: 'EarlyAccessPreview' },
          { version: '6.11.1', stage: 'ReleasedAndBlessed' },
          { version: '6.11.0', stage: 'ReleasedAndBlessed' },
          { version: '6.1.0', stage: 'ReleasedAndBlessed' },
          { version: '6.1', stage: 'ReleasedAndBlessed' },
          { version: '5.9.1', stage: 'ReleasedAndBlessed' },
          { version: '5.11.0' },
        ],
      };

      test.each([
        { version: '6', expected: '6.11.1' },
        { version: '6.11', expected: '6.11.1' },
        { version: '6.1', expected: '6.1' },
        { version: '5', expected: '5.9.1' },
      ])('resolves $version to $expected', async ({ version, expected }) => {
        scope(baseUrl).get('/tools.json').reply(200, tools);
        const { svc } = await toolContext(NugetVersionResolver);

        expect(await svc.resolve(version)).toBe(expected);
      });

      test.each([
        { version: '6', expected: '6.11.1' },
        { version: '6.11', expected: '6.11.1' },
      ])(
        'resolves $version to $expected in an unordered feed',
        async ({ version, expected }) => {
          scope(baseUrl)
            .get('/tools.json')
            .reply(200, {
              'nuget.exe': [
                { version: '6.1.0', stage: 'ReleasedAndBlessed' },
                { version: '6.11.1', stage: 'ReleasedAndBlessed' },
                { version: '6.2.0', stage: 'ReleasedAndBlessed' },
                { version: '6.11.0', stage: 'ReleasedAndBlessed' },
              ],
            });
          const { svc } = await toolContext(NugetVersionResolver);

          expect(await svc.resolve(version)).toBe(expected);
        },
      );

      test('matches a version equal to the partial one', async () => {
        scope(baseUrl)
          .get('/tools.json')
          .reply(200, {
            'nuget.exe': [{ version: '4.9', stage: 'ReleasedAndBlessed' }],
          });
        const { svc } = await toolContext(NugetVersionResolver);

        expect(await svc.resolve('4.9')).toBe('4.9');
      });

      test('keeps an existing version of any stage', async () => {
        scope(baseUrl)
          .get('/tools.json')
          .reply(200, {
            'nuget.exe': [{ version: '7.0', stage: 'EarlyAccessPreview' }],
          });
        const { svc } = await toolContext(NugetVersionResolver);

        expect(await svc.resolve('7.0')).toBe('7.0');
      });

      test('resolves a major to a major.minor release', async () => {
        scope(baseUrl)
          .get('/tools.json')
          .reply(200, {
            'nuget.exe': [
              { version: '4.8', stage: 'ReleasedAndBlessed' },
              { version: '4.9', stage: 'ReleasedAndBlessed' },
            ],
          });
        const { svc } = await toolContext(NugetVersionResolver);

        // `4.9` isn't semver, it's compared as `4.9.0`
        expect(await svc.resolve('4')).toBe('4.9');
      });

      test.each(['7', '6.12', '4'])(
        'throws for %s without a matching release',
        async (version) => {
          scope(baseUrl).get('/tools.json').reply(200, tools);
          const { svc } = await toolContext(NugetVersionResolver);

          await expect(svc.resolve(version)).rejects.toThrow(
            `No nuget release found for version ${version}`,
          );
        },
      );
    });

    test('keeps a partial version when tools.json is missing', async () => {
      scope(baseUrl).get('/tools.json').reply(404);
      const { svc } = await toolContext(NugetVersionResolver);

      expect(await svc.resolve('6.11')).toBe('6.11');
    });

    test('keeps a partial version when tools.json is not reachable', async () => {
      scope(baseUrl)
        .get('/tools.json')
        .times(3)
        .replyWithError('connection reset');
      const { svc } = await toolContext(NugetVersionResolver);

      expect(await svc.resolve('6')).toBe('6');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(NugetVersionResolver);

      expect(await svc.resolve('6.11.1')).toBe('6.11.1');
    });
  });
});
