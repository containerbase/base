import { arch } from 'node:os';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { ApmInstallService } from './apm.ts';
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
const tarball = 'apm archive';

describe('cli/tools/apm', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '1.0.0' },
    { hostArch: 'arm64', ghArch: 'arm64', version: '1.0.1' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(ApmInstallService);
    const filename = `apm-linux-${ghArch}.tar.gz`;
    const releaseUrl = `/microsoft/apm/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/${filename}.sha256`)
      .reply(200, `${checksum(tarball)}  ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('apm', version),
      strip: 1,
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(ApmInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.0.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('apm', {
      srcDir: pathSvc.versionedToolPath('apm', '1.0.0'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(ApmInstallService);

    await expect(svc.test('1.0.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'apm',
      ['--version'],
      expect.any(Object),
    );
  });
});
