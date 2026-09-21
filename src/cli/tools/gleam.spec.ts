import { arch } from 'node:os';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { GleamInstallService } from './gleam.ts';
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
const tarball = 'gleam archive';

describe('cli/tools/gleam', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '0.34.1' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '0.34.2' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(GleamInstallService);
    const filename = `gleam-v${version}-${ghArch}-unknown-linux-musl.tar.gz`;
    const releaseUrl = `/gleam-lang/gleam/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/${filename}.sha512`)
      .reply(200, `${checksum(tarball, 'sha512')} ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('gleam', version),
      strip: 0,
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(GleamInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.34.1')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('gleam', {
      srcDir: pathSvc.versionedToolPath('gleam', '0.34.1'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(GleamInstallService);

    await expect(svc.test('0.34.1')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'gleam',
      ['--version'],
      expect.any(Object),
    );
  });

  test('validate rejects versions before v0.19.0-rc1', async () => {
    const { svc } = await toolContext(GleamInstallService);

    expect(await svc.validate('0.34.1')).toBe(true);
    expect(await svc.validate('0.18.0')).toBe(false);
    expect(await svc.validate('not-a-version')).toBe(false);
  });
});
