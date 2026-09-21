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

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(NugetVersionResolver);

      expect(await svc.resolve('6.11.1')).toBe('6.11.1');
    });
  });
});
