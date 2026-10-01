import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../../services/index.ts';
import { PaketInstallService } from './paket.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));

describe('cli/tools/dotnet/paket', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    execaMock.mockResolvedValue({ failed: false });
  });

  test('install', async () => {
    const { svc, pathSvc } = await toolContext(PaketInstallService);

    await expect(svc.install('8.0.3')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledExactlyOnceWith(
      'dotnet',
      [
        'tool',
        'install',
        '--tool-path',
        pathSvc.versionedToolPath('paket', '8.0.3'),
        'paket',
        '--version',
        '8.0.3',
      ],
      expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(PaketInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('8.0.3')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('paket', {
      srcDir: pathSvc.versionedToolPath('paket', '8.0.3'),
      extraToolEnvs: ['dotnet'],
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(PaketInstallService);

    await expect(svc.test('8.0.3')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledExactlyOnceWith(
      'paket',
      ['--version'],
      expect.objectContaining({ stdio: ['inherit', 'inherit', 1] }),
    );
  });
});
