import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { ApkoInstallService } from './apko.ts';
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
const tarball = 'apko archive';

describe('cli/tools/apko', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'amd64', version: '0.30.11' },
    { hostArch: 'arm64', ghArch: 'arm64', version: '0.30.12' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(ApkoInstallService);
    const filename = `apko_${version}_linux_${ghArch}.tar.gz`;
    const releaseUrl = `/chainguard-dev/apko/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/checksums.txt`)
      .reply(200, `${checksum(tarball)}  ${filename}\n`)
      .get(`${releaseUrl}/${filename}`)
      .reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: join(pathSvc.versionedToolPath('apko', version), 'bin'),
      strip: 1,
    });
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(ApkoInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.30.11')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('apko', {
      srcDir: join(pathSvc.versionedToolPath('apko', '0.30.11'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(ApkoInstallService);

    await expect(svc.test('0.30.11')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'apko',
      ['version'],
      expect.any(Object),
    );
  });
});
