import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { PixiInstallService } from './pixi.ts';
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
const tarball = 'pixi archive';

describe('cli/tools/pixi', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '0.39.0' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '0.39.1' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(PixiInstallService);
    const filename = `pixi-${ghArch}-unknown-linux-musl.tar.gz`;
    const releaseUrl = `/prefix-dev/pixi/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/${filename}.sha256`)
      .reply(200, `${checksum(tarball)} ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: join(pathSvc.versionedToolPath('pixi', version), 'bin'),
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(PixiInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.39.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('pixi', {
      srcDir: join(pathSvc.versionedToolPath('pixi', '0.39.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(PixiInstallService);

    await expect(svc.test('0.39.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'pixi',
      ['--version'],
      expect.any(Object),
    );
  });
});
