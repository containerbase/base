import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { GhInstallService } from './gh.ts';
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
const tarball = 'gh archive';

describe('cli/tools/gh', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the archive is verified against the release list
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '2.62.0' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '2.62.1' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(GhInstallService);
      const dirname = `gh_${version}_linux_${toolArch}`;
      const filename = `${dirname}.tar.gz`;
      const releaseUrl = `/cli/cli/releases/download/v${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/gh_${version}_checksums.txt`)
        .reply(200, `${checksum(tarball)}  ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: pathSvc.versionedToolPath('gh', version),
        strip: 1,
        files: [`${dirname}/bin/gh`],
      });
    },
  );

  test('install: downloads the tool-versions file without the list', async () => {
    const releaseUrl = '/cli/cli/releases/download/v2.63.0';
    const filename = 'gh_2.63.0_linux_amd64.tar.gz';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/gh_2.63.0_linux_arm64.tar.gz`,
        'arm',
        'arm64',
      ),
      toolFile(`${baseUrl}${releaseUrl}/${filename}`, tarball, 'amd64'),
    ]);
    // there is no interceptor for the checksums file
    scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc } = await toolContext(GhInstallService);

    await expect(svc.install('2.63.0')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ file: expect.stringContaining(filename) }),
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(GhInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('2.62.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('gh', {
      srcDir: join(pathSvc.versionedToolPath('gh', '2.62.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(GhInstallService);

    await expect(svc.test('2.62.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'gh',
      ['--version'],
      expect.any(Object),
    );
  });

  test('validate accepts versions from 2.0.0', async () => {
    const { svc } = await toolContext(GhInstallService);

    expect(await svc.validate('2.62.0')).toBe(true);
    expect(await svc.validate('3.0.0')).toBe(true);
    expect(await svc.validate('1.14.0')).toBe(false);
    expect(await svc.validate('not-a-version')).toBe(false);
  });
});
