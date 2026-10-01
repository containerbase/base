import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../services/index.ts';
import { BazeliskInstallService } from './bazelisk.ts';
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

describe('cli/tools/bazelisk', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '1.20.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '1.20.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(BazeliskInstallService);
      scope(baseUrl)
        .get(
          `/bazelbuild/bazelisk/releases/download/v${version}/bazelisk-linux-${toolArch}`,
        )
        .reply(200, 'bazelisk binary');

      await expect(svc.install(version)).resolves.toBeUndefined();

      const bin = join(pathSvc.versionedToolPath('bazelisk', version), 'bin');
      expect(await fs.readFile(join(bin, 'bazelisk'), 'utf8')).toBe(
        'bazelisk binary',
      );
      expect(await fs.readlink(join(bin, 'bazel'))).toBe(join(bin, 'bazelisk'));
    },
  );

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(BazeliskInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const src = join(pathSvc.versionedToolPath('bazelisk', '1.20.0'), 'bin');

    await expect(svc.link('1.20.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith('bazelisk', { srcDir: src });
    expect(spy).toHaveBeenCalledWith('bazelisk', {
      name: 'bazel',
      srcDir: src,
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(BazeliskInstallService);

    await expect(svc.test('1.20.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'bazelisk',
      ['version'],
      expect.any(Object),
    );
  });
});
