import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { SkopeoInstallService } from './skopeo.ts';
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
const tarball = 'skopeo archive';

describe('cli/tools/skopeo', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '1.16.1' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '1.16.2' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(SkopeoInstallService);
    const filename = `skopeo-${version}-${ghArch}.tar.xz`;
    const releaseUrl = `/containerbase/skopeo-prebuild/releases/download/${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/${filename}.sha512`)
      .reply(200, `${checksum(tarball, 'sha512')}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.toolPath('skopeo'),
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(SkopeoInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.16.1')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('skopeo', {
      srcDir: join(pathSvc.versionedToolPath('skopeo', '1.16.1'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(SkopeoInstallService);

    await expect(svc.test('1.16.1')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'skopeo',
      ['--version'],
      expect.any(Object),
    );
  });
});
