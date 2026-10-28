import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { CompressionService, LinkToolService } from '../services/index.ts';
import { JsonnetBundlerInstallService } from './jb.ts';
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
const binary = 'jb binary';
const tarball = 'jb archive';

describe('cli/tools/jb', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the prebuild is verified against its checksum file
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '0.5.1' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '0.6.0' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(JsonnetBundlerInstallService);
      scope(baseUrl)
        .get(
          `/jsonnet-bundler/jsonnet-bundler/releases/download/v${version}/jb-linux-${toolArch}`,
        )
        .reply(200, binary);

      await expect(svc.install(version)).resolves.toBeUndefined();

      const file = join(pathSvc.versionedToolPath('jb', version), 'bin', 'jb');
      expect(await fs.readFile(file, 'utf8')).toBe(binary);
      expect((await fs.stat(file)).mode & 0o777).toBe(0o775);
    },
  );

  test.each([
    { hostArch: 'x64', ghArch: 'x86_64', version: '0.6.0.1' },
    { hostArch: 'arm64', ghArch: 'aarch64', version: '0.6.0.2' },
  ] as const)(
    'install prebuild on $ghArch',
    async ({ hostArch, ghArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(JsonnetBundlerInstallService);
      const filename = `jb-${version}-${ghArch}.tar.xz`;
      const releaseUrl = `/containerbase/jb-prebuild/releases/download/${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/${filename}.sha512`)
        .reply(200, `${checksum(tarball, 'sha512')}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, tarball);
      const extract = vi.spyOn(CompressionService.prototype, 'extract');

      await expect(svc.install(version)).resolves.toBeUndefined();

      expect(extract).toHaveBeenCalledExactlyOnceWith({
        file: expect.stringContaining(filename),
        cwd: pathSvc.toolPath('jb'),
      });
    },
  );

  test('install: downloads the tool-versions prebuild without the .sha512', async () => {
    const releaseUrl = '/containerbase/jb-prebuild/releases/download/0.6.0.3';
    const filename = 'jb-0.6.0.3-x86_64.tar.xz';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/jb-0.6.0.3-aarch64.tar.xz`,
        'arm',
        'arm64',
      ),
      toolFile(`${baseUrl}${releaseUrl}/${filename}`, tarball, 'amd64'),
    ]);
    // there is no interceptor for the `.sha512`
    scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, tarball);
    const extract = vi.spyOn(CompressionService.prototype, 'extract');
    const { svc, pathSvc } = await toolContext(JsonnetBundlerInstallService);

    await expect(svc.install('0.6.0.3')).resolves.toBeUndefined();

    expect(extract).toHaveBeenCalledExactlyOnceWith({
      file: expect.stringContaining(filename),
      cwd: pathSvc.toolPath('jb'),
    });
  });

  test.each([
    { version: '0.6.0', expected: true },
    { version: '0.6.0.1', expected: true },
    { version: 'not-a-version', expected: false },
  ])('validate $version', async ({ version, expected }) => {
    const { svc } = await toolContext(JsonnetBundlerInstallService);

    expect(await svc.validate(version)).toBe(expected);
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(JsonnetBundlerInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('0.6.0')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('jb', {
      srcDir: join(pathSvc.versionedToolPath('jb', '0.6.0'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(JsonnetBundlerInstallService);

    await expect(svc.test('0.6.0')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'jb',
      ['--version'],
      expect.any(Object),
    );
  });
});
