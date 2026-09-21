import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { BufInstallService } from './buf.ts';
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
const tarball = 'buf archive';

describe('cli/tools/buf', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '1.67.0' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '1.67.1' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(BufInstallService);
    const filename = `buf-Linux-${ghArch}.tar.gz`;
    const releaseUrl = `/bufbuild/buf/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/sha256.txt`)
      .reply(200, `${checksum(tarball)} ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('buf', version),
      strip: 1,
      files: ['buf/bin/buf'],
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(BufInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.67.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('buf', {
      srcDir: join(pathSvc.versionedToolPath('buf', '1.67.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(BufInstallService);

    await expect(svc.test('1.67.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'buf',
      ['--version'],
      expect.any(Object),
    );
  });
});
