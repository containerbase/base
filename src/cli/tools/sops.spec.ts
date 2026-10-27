import fs from 'node:fs/promises';
import { arch } from 'node:os';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LinkToolService } from '../services/index.ts';
import { SopsInstallService } from './sops.ts';
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
const binary = 'sops binary';

describe('cli/tools/sops', () => {
  beforeAll(async () => {
    await ensurePaths(['tmp', 'opt/containerbase/bin']);
  });

  beforeEach(() => {
    vi.mocked(arch).mockReturnValue('x64');
    // no tool-versions data, the binary is verified against the release list
    mockToolFiles();
    execaMock.mockResolvedValue({ failed: false });
  });

  test.each([
    { hostArch: 'x64', toolArch: 'amd64', version: '3.9.1' },
    { hostArch: 'arm64', toolArch: 'arm64', version: '3.9.2' },
  ] as const)(
    'install on $toolArch',
    async ({ hostArch, toolArch, version }) => {
      vi.mocked(arch).mockReturnValue(hostArch);
      const { svc, pathSvc } = await toolContext(SopsInstallService);
      const filename = `sops-v${version}.linux.${toolArch}`;
      const releaseUrl = `/getsops/sops/releases/download/v${version}`;
      scope(baseUrl)
        .get(`${releaseUrl}/sops-v${version}.checksums.txt`)
        .reply(200, `${checksum(binary)} ${filename}\n`)
        .get(`${releaseUrl}/${filename}`)
        .reply(200, binary);

      await expect(svc.install(version)).resolves.toBeUndefined();

      const file = join(
        pathSvc.versionedToolPath('sops', version),
        'bin',
        'sops',
      );
      expect(await fs.readFile(file, 'utf8')).toBe(binary);
      expect((await fs.stat(file)).mode & 0o777).toBe(0o775);
    },
  );

  test('install: downloads the tool-versions file without the list', async () => {
    const releaseUrl = '/getsops/sops/releases/download/v3.10.0';
    const filename = 'sops-v3.10.0.linux.amd64';
    mockToolFiles([
      toolFile(
        `${baseUrl}${releaseUrl}/sops-v3.10.0.linux.arm64`,
        'arm',
        'arm64',
      ),
      toolFile(`${baseUrl}${releaseUrl}/${filename}`, binary, 'amd64'),
    ]);
    // there is no interceptor for the checksums file
    scope(baseUrl).get(`${releaseUrl}/${filename}`).reply(200, binary);
    const { svc, pathSvc } = await toolContext(SopsInstallService);

    await expect(svc.install('3.10.0')).resolves.toBeUndefined();

    const file = join(pathSvc.versionedToolPath('sops', '3.10.0'), 'bin/sops');
    expect(await fs.readFile(file, 'utf8')).toBe(binary);
  });

  test('link', async () => {
    const { svc, pathSvc } = await toolContext(SopsInstallService);
    const spy = vi.spyOn(LinkToolService.prototype, 'shellwrapper');

    await expect(svc.link('3.9.1')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledExactlyOnceWith('sops', {
      srcDir: join(pathSvc.versionedToolPath('sops', '3.9.1'), 'bin'),
    });
  });

  test('runs the tool test', async () => {
    const { svc } = await toolContext(SopsInstallService);

    await expect(svc.test('3.9.1')).resolves.toBeUndefined();

    expect(execaMock).toHaveBeenCalledWith(
      'sops',
      ['--version'],
      expect.any(Object),
    );
  });
});
