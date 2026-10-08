import { arch } from 'node:os';
import { join } from 'node:path';
import { codeBlock } from 'common-tags';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../../services/index.ts';
import { VpInstallService } from './vp.ts';
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
const archive = 'vp archive';

describe('cli/tools/node/vp', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', target: 'x86_64', version: '0.3.1' },
    { hostArch: 'arm64', target: 'aarch64', version: '1.0.0' },
  ] as const)('install on $target', async ({ hostArch, target, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(VpInstallService);
    const filename = `vp-${target}-unknown-linux-gnu.tar.gz`;
    const releaseUrl = `/voidzero-dev/vite-plus/releases/download/v${version}`;
    scope(baseUrl)
      .get(`${releaseUrl}/vp-checksums.txt`)
      .reply(
        200,
        codeBlock`
          ${checksum('other archive')}  vp-other-unknown-linux-gnu.tar.gz
          ${checksum(archive)}  ${filename}
        `,
      )
      .get(`${releaseUrl}/${filename}`)
      .reply(200, archive);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: join(pathSvc.versionedToolPath('vp', version), 'bin'),
    });
  });

  test('rejects versions before the checksum file was published', async () => {
    const { svc } = await toolContext(VpInstallService);

    await expect(svc.install('0.3.0')).rejects.toThrow(
      'Vite+ releases before 0.3.1 have no checksum file and are not supported',
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(VpInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('1.0.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('vp', {
      srcDir: join(pathSvc.versionedToolPath('vp', '1.0.0'), 'bin'),
      extraToolEnvs: ['node'],
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(VpInstallService);

    await expect(svc.test('1.0.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'vp',
      ['--version'],
      expect.any(Object),
    );
  });
});
