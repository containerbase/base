import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { MiseInstallService, MiseVersionResolver } from './mise.ts';
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
const tarball = 'mise archive';

describe('cli/tools/mise', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'x64', version: '2026.2.13' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '2026.2.14' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(MiseInstallService);
      const filename = `mise-v${version}-linux-${toolArch}.tar.xz`;
      const releaseUrl = `/jdx/mise/releases/download/v${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/SHASUMS256.txt`)
        .reply(200, `${checksum(tarball)}  ./${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: pathSvc.versionedToolPath('mise', version),
        strip: 1,
        files: ['mise/bin/mise'],
      });
    },
  );

  test('install: throws without a matching checksum', async () => {
    const { svc } = await toolContext(MiseInstallService);
    scope(baseUrl)
      .get('/jdx/mise/releases/download/v2026.2.15/SHASUMS256.txt')
      .reply(200, `${checksum(tarball)}  ./mise-v2026.2.15-linux-s390x.tar.xz`);

    await expect(svc.install('2026.2.15')).rejects.toThrow(
      `Checksum not found in ${baseUrl}/jdx/mise/releases/download/v2026.2.15/SHASUMS256.txt for ./mise-v2026.2.15-linux-x64.tar.xz`,
    );
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(MiseInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('2026.2.13')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('mise', {
      srcDir: join(pathSvc.versionedToolPath('mise', '2026.2.13'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(MiseInstallService);

    await expect(svc.test('2026.2.13')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'mise',
      ['version'],
      expect.any(Object),
    );
  });

  describe('MiseVersionResolver', () => {
    test.each([{ version: undefined }, { version: '' }, { version: 'latest' }])(
      'resolves $version',
      async ({ version }) => {
        scope('https://mise.jdx.dev').get('/VERSION').reply(200, '2026.2.13\n');
        const { svc } = await toolContext(MiseVersionResolver);

        expect(await svc.resolve(version)).toBe('2026.2.13');
      },
    );

    test('keeps a pinned version', async () => {
      const { svc } = await toolContext(MiseVersionResolver);

      expect(await svc.resolve('2026.2.13')).toBe('2026.2.13');
    });
  });
});
