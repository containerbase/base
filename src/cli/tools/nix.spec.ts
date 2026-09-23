import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { NixInstallService } from './nix.ts';
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
const prebuild = '/containerbase/nix-prebuild/releases/download';
const archive = 'nix archive';

describe('cli/tools/nix', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '2.35.1' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '2.35.2' },
  ] as const)('install on $ghArch', async ({ hostArch, ghArch, version }) => {
    vi.mocked(arch).mockReturnValue(hostArch);
    const { svc, pathSvc } = await toolContext(NixInstallService);
    const filename = `${version}/nix-${version}-${ghArch}.tar.xz`;
    scope(baseUrl)
      .get(`${prebuild}/${filename}.sha512`)
      .reply(200, `${checksum(archive, 'sha512')}\n`)
      .get(`${prebuild}/${filename}`)
      .reply(200, archive);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');

    await expect(svc.install(version)).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(`nix-${version}-${ghArch}.tar.xz`),
      cwd: pathSvc.toolPath('nix'),
    });
  });

  test('install: rejects a checksum mismatch', async () => {
    const { svc } = await toolContext(NixInstallService);
    const filename = '2.35.0/nix-2.35.0-x86_64.tar.xz';
    scope(baseUrl)
      .get(`${prebuild}/${filename}.sha512`)
      .reply(200, `${checksum('other', 'sha512')}\n`)
      .get(`${prebuild}/${filename}`)
      .times(3)
      .reply(200, archive);

    await expect(svc.install('2.35.0')).rejects.toThrow('download failed');
  });

  test('link exports the nix dirs below the cache', async () => {
    const { svc, pathSvc } = await toolContext(NixInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');
    const cache = join(pathSvc.cachePath, 'nix');

    await expect(svc.link('2.35.2')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('nix', {
      srcDir: join(pathSvc.versionedToolPath('nix', '2.35.2'), 'bin'),
      exports: `NIX_STORE_DIR=${cache}/store NIX_DATA_DIR=${cache}/data NIX_LOG_DIR=${cache}/log NIX_STATE_DIR=${cache}/state NIX_CONF_DIR=${cache}/conf`,
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(NixInstallService);

    await expect(svc.test('2.35.2')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'nix',
      ['--version'],
      expect.any(Object),
    );
  });

  test.each([
    { version: '2.10.3', valid: true },
    { version: '2.35.2', valid: true },
    { version: '2.10.2', valid: false },
    { version: '1.11.0', valid: false },
    { version: 'latest', valid: false },
  ])('validates $version', async ({ version, valid }) => {
    const { svc } = await toolContext(NixInstallService);

    await expect(svc.validate(version)).resolves.toBe(valid);
  });
});
