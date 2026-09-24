import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { ScalaInstallService } from './scala.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

describe('cli/tools/java/scala', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  test('install', async () => {
    const { svc, pathSvc } = await toolContext(ScalaInstallService);
    scope('https://downloads.lightbend.com')
      .get('/scala/2.13.16/scala-2.13.16.tgz')
      .reply(200, 'scala archive');
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install('2.13.16')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining('scala-2.13.16.tgz'),
      cwd: pathSvc.versionedToolPath('scala', '2.13.16'),
      strip: 1,
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(ScalaInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('2.13.16')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('scala', {
      srcDir: join(pathSvc.versionedToolPath('scala', '2.13.16'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(ScalaInstallService);

    await expect(svc.test('2.13.16')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'scala',
      ['--version'],
      expect.any(Object),
    );
  });
});
