import { arch } from 'node:os';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { GleamInstallService } from './gleam.ts';
import { scope } from '~test/http-mock.ts';
import { ensurePaths } from '~test/path.ts';
import { checksum, mockToolFiles, toolContext, toolFile } from '~test/tool.ts';

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
    // no tool-versions data, the archive is verified against its checksum file
    mockToolFiles();
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

  test('install: downloads the tool-versions file without the .sha512', async () => {
    const releaseUrl = '/gleam-lang/gleam/releases/download/v0.35.0';
    const filename = 'gleam-v0.35.0-x86_64-unknown-linux-musl.tar.gz';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/gleam-v0.35.0-aarch64-unknown-linux-musl.tar.gz`,
        'arm',
        'arm64',
      ),
      // the data has the sha512 of the release
      {
        ...toolFile(`${baseUrl}${releaseUrl}/${filename}`, tarball, 'amd64'),
        checksum: `sha512:${checksum(tarball, 'sha512')}`,
      },
    ]);
    // there is no interceptor for the `.sha512`
    scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc } = await toolContext(GleamInstallService);

    await expect(svc.install('0.35.0')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ file: expect.stringContaining(filename) }),
    );
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

  test('validate rejects versions before v0.23.0', async () => {
    const { svc } = await toolContext(GleamInstallService);

    expect(await svc.validate('0.34.1')).toBe(true);
    expect(await svc.validate('0.23.0')).toBe(true);
    expect(await svc.validate('0.22.1')).toBe(false);
    expect(await svc.validate('not-a-version')).toBe(false);
  });
});
