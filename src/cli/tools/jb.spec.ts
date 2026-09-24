import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../services/index.ts';
import { JsonnetBundlerInstallService } from './jb.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';
const binary = 'jb binary';

describe('cli/tools/jb', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '0.5.1' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '0.6.0' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(JsonnetBundlerInstallService);
      scope(baseUrl)
        .get(
          `/jsonnet-bundler/jsonnet-bundler/releases/download/v${version}/jb-linux-${toolArch}`,
        )
        .reply(200, binary);

      await expect(svc.install(version)).resolves.toBeUndefined();

      const file = join(pathSvc.versionedToolPath('jb', version), 'bin', 'jb');
      expect(await fs.readFile(file, 'utf8')).toBe(binary);
      expect((await fs.stat(file)).mode & 0o777).toBe(0o775);
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(JsonnetBundlerInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.6.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('jb', {
      srcDir: join(pathSvc.versionedToolPath('jb', '0.6.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(JsonnetBundlerInstallService);

    await expect(svc.test('0.6.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'jb',
      ['--version'],
      expect.any(Object),
    );
  });
});
