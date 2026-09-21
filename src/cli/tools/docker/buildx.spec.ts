import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService, PathService } from '../../services/index.ts';
import { BuildxInstallService } from './buildx.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, toolContext } from '~test/tool.ts';

const { execaMock } = vi.hoisted(() => ({ execaMock: vi.fn() }));
vi.mock('execa', () => ({ execa: execaMock }));
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  arch: vi.fn(() => 'x64'),
}));

const baseUrl = 'https://github.com';
const binary = 'buildx binary';

describe('cli/tools/docker/buildx', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '0.18.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '0.18.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(BuildxInstallService);
      const filename = `buildx-v${version}.linux-${toolArch}`;
      const releaseUrl = `/docker/buildx/releases/download/v${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/checksums.txt`)
        .reply(200, `${checksum(binary)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, binary);

      await expect(svc.install(version)).resolves.toBeUndefined();

      const bin = join(
        pathSvc.versionedToolPath('buildx', version),
        'bin',
        'buildx',
      );
      expect(await fs.readFile(bin, 'utf8')).toBe(binary);
      expect((await fs.stat(bin)).mode & 0o777).toBe(0o775);
    },
  );

  test('install: without a checksum before v0.7.0', async () => {
    const { svc, pathSvc } = await toolContext(BuildxInstallService);
    scope(baseUrl)
      .get('/docker/buildx/releases/download/v0.6.3/buildx-v0.6.3.linux-amd64')
      .reply(200, binary);

    await expect(svc.install('0.6.3')).resolves.toBeUndefined();

    expect(
      await fs.readFile(
        join(pathSvc.versionedToolPath('buildx', '0.6.3'), 'bin', 'buildx'),
        'utf8',
      ),
    ).toBe(binary);
  });

  test('link', async () => {
    const { svc, child } = await toolContext(BuildxInstallService);
    const pathSvc = await child.getAsync(PathService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const src = join(pathSvc.versionedToolPath('buildx', '0.18.0'), 'bin');
    const plugin = join(pathSvc.cachePath, '.docker/cli-plugins/docker-buildx');
    await pathSvc.createDir(join(pathSvc.cachePath, '.docker/cli-plugins'));

    await expect(svc.link('0.18.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('buildx', { srcDir: src });
    expect(await fs.readlink(plugin)).toBe(join(src, 'buildx'));

    // an existing plugin link is replaced
    await expect(svc.link('0.18.0')).resolves.toBeUndefined();
    expect(await fs.readlink(plugin)).toBe(join(src, 'buildx'));
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(BuildxInstallService);

    await expect(svc.test('0.18.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'docker',
      ['buildx', 'version'],
      expect.any(Object),
    );
  });
});
