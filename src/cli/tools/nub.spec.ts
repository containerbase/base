import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { NubInstallService } from './nub.ts';
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
const archive = 'nub archive';

describe('cli/tools/nub', () => {
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
    { hostArch: 'x64', ghArch: 'x64', version: '0.9.3' },
    { hostArch: 'arm64', ghArch: 'arm64', version: '0.9.2' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(NubInstallService);
    const filename = `nub-linux-${ghArch}.tar.gz`;
    const releaseUrl = `/nubjs/nub/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/${filename}.sha256`)
      .reply(200, `${checksum(archive)}  ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, archive);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.versionedToolPath('nub', version),
    });
  });

  test('install: downloads the tool-versions file without the .sha256', async () => {
    const releaseUrl = '/nubjs/nub/releases/download/v0.10.0';
    const filename = 'nub-linux-x64.tar.gz';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/nub-linux-arm64.tar.gz`,
        'arm',
        'arm64',
      ),
      toolFile(`${baseUrl}${releaseUrl}/${filename}`, archive, 'amd64'),
    ]);
    // there is no interceptor for the `.sha256`
    scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, archive);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc } = await toolContext(NubInstallService);

    await expect(svc.install('0.10.0')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ file: expect.stringContaining(filename) }),
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(NubInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.9.3')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('nub', {
      srcDir: join(pathSvc.versionedToolPath('nub', '0.9.3'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(NubInstallService);

    await expect(svc.test('0.9.3')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'nub',
      ['--version'],
      expect.any(Object),
    );
  });
});
