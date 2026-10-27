import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { DenoInstallService } from './deno.ts';
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
const zip = 'deno archive';

describe('cli/tools/deno', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the zip is verified against its checksum file
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '2.4.5' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '2.4.6' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(DenoInstallService);
    const filename = `deno-${ghArch}-unknown-linux-gnu.zip`;
    const releaseUrl = `/denoland/deno/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/${filename}.sha256sum`)
      .reply(200, `${checksum(zip)} ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, zip);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: join(pathSvc.versionedToolPath('deno', version), 'bin'),
      strip: 0,
    });
  });

  test('install: downloads the tool-versions file without the .sha256sum', async () => {
    const releaseUrl = '/denoland/deno/releases/download/v2.5.0';
    const filename = 'deno-x86_64-unknown-linux-gnu.zip';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/deno-aarch64-unknown-linux-gnu.zip`,
        'arm',
        'arm64',
      ),
      toolFile(`${baseUrl}${releaseUrl}/${filename}`, zip, 'amd64'),
    ]);
    // there is no interceptor for the `.sha256sum`
    scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, zip);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc } = await toolContext(DenoInstallService);

    await expect(svc.install('2.5.0')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ file: expect.stringContaining(filename) }),
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(DenoInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('2.4.5')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('deno', {
      srcDir: join(pathSvc.versionedToolPath('deno', '2.4.5'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(DenoInstallService);

    await expect(svc.test('2.4.5')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'deno',
      ['--version'],
      expect.any(Object),
    );
  });
});
