import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PathService, VersionService } from '../../services/index.ts';
import {
  CocoapodsInstallService,
  CocoapodsVersionResolver,
} from './cocoapods.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

const rubyVersion = '3.4.1';

describe('cli/tools/ruby/cocoapods', () => {
  beforeAll(async () => {
    await ensurePaths([
      'tmp',
      'opt/containerbase/bin',
      'opt/containerbase/data',
      'opt/containerbase/versions',
    ]);

    const verSvc = await (await testContainer()).getAsync(VersionService);
    await verSvc.setCurrent({
      name: 'ruby',
      tool: { name: 'ruby', version: rubyVersion },
    });
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false, all: 'ok' });
  });

  test('install: pins activesupport for the affected versions', async () => {
    const { svc, child } = await toolContext(CocoapodsInstallService);
    const pathSvc = await child.getAsync(PathService);

    await expect(svc.install('1.12.1')).resolves.toBeUndefined();

    const prefix = join(
      pathSvc.versionedToolPath('cocoapods', '1.12.1'),
      rubyVersion,
    );
    expect(execaMock).toHaveBeenCalledWith(
      expect.stringContaining('bin/gem'),
      expect.arrayContaining([
        'install',
        'activesupport',
        '--version',
        '<7.1.0',
      ]),
      expect.any(Object),
    );
    expect(execaMock).toHaveBeenCalledWith(
      expect.stringContaining('bin/gem'),
      expect.arrayContaining([
        'uninstall',
        'activesupport',
        '--bindir',
        join(prefix, 'bin'),
      ]),
      expect.any(Object),
    );
  });

  test('install: leaves other versions alone', async () => {
    const { svc } = await toolContext(CocoapodsInstallService);

    await expect(svc.install('1.15.2')).resolves.toBeUndefined();

    expect(execaMock).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['activesupport']),
      expect.any(Object),
    );
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(CocoapodsInstallService);

    await expect(svc.test('1.15.2')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'pod',
      ['--version', '--allow-root'],
      expect.any(Object),
    );
  });

  describe('CocoapodsVersionResolver', () => {
    test('resolves latest', async () => {
      scope('https://rubygems.org')
        .get('/api/v1/gems/cocoapods.json')
        .reply(200, { version: '1.15.2' });
      const { svc } = await toolContext(CocoapodsVersionResolver);

      expect(await svc.resolve('latest')).toBe('1.15.2');
    });

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(CocoapodsVersionResolver);

      expect(await svc.resolve('1.15.2')).toBe('1.15.2');
    });
  });
});
