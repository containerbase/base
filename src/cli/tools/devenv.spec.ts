import { createHash } from 'node:crypto';
import { arch } from 'node:os';
import type { Container } from 'inversify';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { DevenvInstallService, DevenvVersionResolver } from './devenv.ts';
import { testContainer } from '~test/di.ts';
import { scope } from '~test/http-mock.ts';
import { rootPath } from '~test/path.ts';

vi.mock('node:os', async (importActual) => ({
  ...(await importActual<typeof import('node:os')>()),
  arch: vi.fn(),
}));

const baseUrl = 'https://github.com/containerbase/devenv-prebuild/releases';

function sha512(content: string): string {
  return createHash('sha512').update(content).digest('hex');
}

describe('cli/tools/devenv', () => {
  let child!: Container;
  let svc!: DevenvInstallService;

  beforeEach(async () => {
    vi.mocked(arch).mockReturnValue('x64');
    child = await testContainer();
    child.bind(DevenvInstallService).toSelf();
    child.bind(DevenvVersionResolver).toSelf();
    svc = await child.getAsync(DevenvInstallService);
  });

  test.each([
    // the static build only works from v2.3.1 on
    { version: '2.2.2', expected: false },
    { version: '2.3', expected: false },
    { version: '2.3.0', expected: false },
    { version: '2.3.1', expected: true },
    { version: '2.4.1', expected: true },
    { version: '3.0', expected: true },
    { version: 'latest', expected: false },
  ])('validate($version) === $expected', async ({ version, expected }) => {
    expect(await svc.validate(version)).toBe(expected);
  });

  test.each([
    { nodeArch: 'x64', ghArch: 'x86_64', version: '2.3.1' },
    { nodeArch: 'arm64', ghArch: 'aarch64', version: '2.4' },
  ] as const)(
    'installs the $ghArch prebuild',
    async ({ nodeArch, ghArch, version }) => {
      vi.mocked(arch).mockReturnValue(nodeArch);
      child = await testContainer();
      child.bind(DevenvInstallService).toSelf();
      svc = await child.getAsync(DevenvInstallService);

      const extract = vi
        .spyOn(CompressionService.prototype, 'extract')
        .mockResolvedValue();
      const tarball = `devenv payload for ${ghArch}`;

      scope(baseUrl)
        .get(`/download/${version}/devenv-${version}-${ghArch}.tar.xz.sha512`)
        .reply(200, sha512(tarball))
        .get(`/download/${version}/devenv-${version}-${ghArch}.tar.xz`)
        .reply(200, tarball);

      await svc.install(version);

      expect(extract).toHaveBeenCalledWith({
        file: expect.stringContaining(`devenv-${version}-${ghArch}.tar.xz`),
        cwd: rootPath('opt/containerbase/tools/devenv'),
      });
    },
  );

  test('links a wrapper sharing the nix store', async () => {
    const shellwrapper = vi
      .spyOn(LinkToolService.prototype, 'shellwrapper')
      .mockResolvedValue();

    await svc.link('2.3');

    // the same store the `nix` tool points at, see tools/v2/nix.sh
    const nixDir = rootPath('tmp/containerbase/cache/nix');

    expect(shellwrapper).toHaveBeenCalledWith('devenv', {
      srcDir: rootPath('opt/containerbase/tools/devenv/2.3/bin'),
      exports: [
        `NIX_STORE_DIR=${nixDir}/store`,
        `NIX_DATA_DIR=${nixDir}/data`,
        `NIX_LOG_DIR=${nixDir}/log`,
        `NIX_STATE_DIR=${nixDir}/state`,
        `NIX_CONF_DIR=${nixDir}/conf`,
      ].join(' '),
    });
  });

  test('resolves the latest version from the prebuild release', async () => {
    const resolver = await child.getAsync(DevenvVersionResolver);
    scope(baseUrl).get('/latest/download/version').reply(200, '2.3');

    expect(await resolver.resolve(undefined)).toBe('2.3');
  });

  test('keeps an explicit version', async () => {
    const resolver = await child.getAsync(DevenvVersionResolver);

    expect(await resolver.resolve('2.4')).toBe('2.4');
  });
});
